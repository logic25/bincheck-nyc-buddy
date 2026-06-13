-- ACRIS cache layer
-- ============================================================================
-- Caches the JSON result of an ACRIS-by-BBL fetch so we don't re-hit the NYC
-- Open Data (Socrata) endpoints on every report. Each row represents the
-- entire normalized ACRIS payload (documents / deeds / mortgages / liens) for
-- a single BBL. The dd-report generator and (eventually) any other consumer
-- read through `fetch-acris-bbl` which transparently hits cache first.
--
-- Why a single JSON column instead of normalized rows? The shape we ship to
-- the report renderer is opinionated (party1/party2 joined strings, doc deep
-- links, etc). If we ever need raw normalized rows we'll add a side table.
--
-- The eventual ACRIS-subscription paperwork (212-487-6300, registerinfo@finance.nyc.gov)
-- unlocks a higher-throughput direct feed; this cache stays useful either way.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.acris_cache (
  bbl              text PRIMARY KEY,
  borough          smallint NOT NULL,
  block            integer  NOT NULL,
  lot              integer  NOT NULL,
  payload          jsonb    NOT NULL,
  doc_count        integer  NOT NULL DEFAULT 0,
  source           text     NOT NULL DEFAULT 'socrata',
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  -- Cheap audit fields
  hit_count        integer  NOT NULL DEFAULT 0,
  last_accessed_at timestamptz,
  CONSTRAINT acris_cache_bbl_digits CHECK (bbl ~ '^[0-9]{10}$')
);

CREATE INDEX IF NOT EXISTS idx_acris_cache_expires_at  ON public.acris_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_acris_cache_fetched_at  ON public.acris_cache (fetched_at DESC);

ALTER TABLE public.acris_cache ENABLE ROW LEVEL SECURITY;

-- Reads are admin-only via dashboard; the edge function uses service_role and
-- bypasses RLS. We intentionally do not grant select to anon/authenticated.
DROP POLICY IF EXISTS acris_cache_admin_read ON public.acris_cache;
CREATE POLICY acris_cache_admin_read
  ON public.acris_cache FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Helper: upsert an ACRIS payload with a 7-day TTL by default.
CREATE OR REPLACE FUNCTION public.upsert_acris_cache(
  _bbl     text,
  _payload jsonb,
  _ttl     interval DEFAULT INTERVAL '7 days',
  _source  text     DEFAULT 'socrata'
)
RETURNS public.acris_cache
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean text := regexp_replace(_bbl, '\D', '', 'g');
  v_borough smallint;
  v_block   integer;
  v_lot     integer;
  v_count   integer;
  v_row     public.acris_cache;
BEGIN
  IF length(v_clean) <> 10 THEN
    RAISE EXCEPTION 'BBL must be 10 digits (got "%")', _bbl USING ERRCODE = '22023';
  END IF;
  v_borough := substring(v_clean from 1 for 1)::smallint;
  v_block   := substring(v_clean from 2 for 5)::integer;
  v_lot     := substring(v_clean from 7 for 4)::integer;

  v_count := COALESCE(jsonb_array_length(_payload->'documents'), 0);

  INSERT INTO public.acris_cache (bbl, borough, block, lot, payload, doc_count, source, fetched_at, expires_at)
  VALUES (v_clean, v_borough, v_block, v_lot, _payload, v_count, _source, now(), now() + _ttl)
  ON CONFLICT (bbl) DO UPDATE
    SET payload    = EXCLUDED.payload,
        doc_count  = EXCLUDED.doc_count,
        source     = EXCLUDED.source,
        fetched_at = EXCLUDED.fetched_at,
        expires_at = EXCLUDED.expires_at
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_acris_cache(text, jsonb, interval, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.upsert_acris_cache(text, jsonb, interval, text) TO service_role;

-- Helper: read cached payload if still fresh. Increments hit counter.
CREATE OR REPLACE FUNCTION public.get_acris_cache(_bbl text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean text := regexp_replace(_bbl, '\D', '', 'g');
  v_payload jsonb;
BEGIN
  IF length(v_clean) <> 10 THEN
    RETURN NULL;
  END IF;

  SELECT payload INTO v_payload
    FROM public.acris_cache
   WHERE bbl = v_clean
     AND expires_at > now();

  IF v_payload IS NULL THEN
    RETURN NULL;
  END IF;

  -- Best-effort access stats
  UPDATE public.acris_cache
     SET hit_count = hit_count + 1,
         last_accessed_at = now()
   WHERE bbl = v_clean;

  RETURN v_payload;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_acris_cache(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_acris_cache(text) TO service_role;

-- Maintenance: prune long-expired rows. Safe to run on cron.
CREATE OR REPLACE FUNCTION public.prune_acris_cache(_grace interval DEFAULT INTERVAL '30 days')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Only admins or service_role can prune' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.acris_cache
   WHERE expires_at < (now() - _grace);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prune_acris_cache(interval) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.prune_acris_cache(interval) TO service_role;

COMMENT ON TABLE  public.acris_cache               IS 'Cached ACRIS-by-BBL payloads (7-day TTL by default). Populated by fetch-acris-bbl edge function.';
COMMENT ON COLUMN public.acris_cache.payload       IS 'Normalized ACRIS result: { documents, deeds, mortgages, liens }';
COMMENT ON FUNCTION public.upsert_acris_cache      IS 'Service-role-only upsert with TTL.';
COMMENT ON FUNCTION public.get_acris_cache         IS 'Service-role read-through with hit-counter side effect.';
COMMENT ON FUNCTION public.prune_acris_cache       IS 'Drops rows expired more than `_grace` ago.';
