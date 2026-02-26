
-- Enum for error categories
CREATE TYPE public.edit_error_category AS ENUM (
  'too_vague',
  'wrong_severity',
  'missing_context',
  'stale_treated_as_active',
  'wrong_agency_explanation',
  'missing_note',
  'factual_error',
  'tone_style',
  'knowledge_gap',
  'other'
);

-- Enum for knowledge types
CREATE TYPE public.knowledge_type AS ENUM (
  'violation_guide',
  'agency_explainer',
  'regulation_reference',
  'penalty_context'
);

-- TABLE 1: report_edits (correction capture)
CREATE TABLE public.report_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.dd_reports(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('violation', 'application', 'complaint')),
  item_identifier text NOT NULL,
  agency text NOT NULL,
  original_note text,
  edited_note text NOT NULL,
  error_category edit_error_category NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  editor_id uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.report_edits ENABLE ROW LEVEL SECURITY;

-- Editors can insert their own edits
CREATE POLICY "Users can insert their own edits"
  ON public.report_edits FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = editor_id);

-- Editors can read their own edits
CREATE POLICY "Users can view their own edits"
  ON public.report_edits FOR SELECT
  TO authenticated
  USING (auth.uid() = editor_id);

-- Admins can read all edits
CREATE POLICY "Admins can view all edits"
  ON public.report_edits FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update all edits (for approve/reject)
CREATE POLICY "Admins can update all edits"
  ON public.report_edits FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- TABLE 2: ai_accuracy_stats (performance tracking)
CREATE TABLE public.ai_accuracy_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency text NOT NULL,
  item_type text NOT NULL,
  violation_type text,
  total_notes_generated integer NOT NULL DEFAULT 0,
  total_edits integer NOT NULL DEFAULT 0,
  edit_rate numeric NOT NULL DEFAULT 0,
  top_error_category text,
  last_updated timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency, item_type, violation_type)
);

ALTER TABLE public.ai_accuracy_stats ENABLE ROW LEVEL SECURITY;

-- Admins can read accuracy stats
CREATE POLICY "Admins can view accuracy stats"
  ON public.ai_accuracy_stats FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admins can manage accuracy stats
CREATE POLICY "Admins can manage accuracy stats"
  ON public.ai_accuracy_stats FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- TABLE 3: knowledge_candidates (gap detection)
CREATE TABLE public.knowledge_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  knowledge_type knowledge_type NOT NULL,
  agency text NOT NULL,
  violation_types jsonb DEFAULT '[]'::jsonb,
  trigger_reason text,
  source_edit_ids jsonb DEFAULT '[]'::jsonb,
  demand_score integer NOT NULL DEFAULT 0,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'detected' CHECK (status IN ('detected', 'drafted', 'approved', 'active')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage knowledge candidates"
  ON public.knowledge_candidates FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- TABLE 4: knowledge_entries (generated reference content)
CREATE TABLE public.knowledge_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES public.knowledge_candidates(id) ON DELETE SET NULL,
  title text NOT NULL,
  content text NOT NULL,
  agency text NOT NULL,
  violation_types jsonb DEFAULT '[]'::jsonb,
  word_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'active')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  usage_count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.knowledge_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage knowledge entries"
  ON public.knowledge_entries FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Service role needs access for edge functions
CREATE POLICY "Service role can read edits"
  ON public.report_edits FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can manage accuracy stats"
  ON public.ai_accuracy_stats FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage knowledge candidates"
  ON public.knowledge_candidates FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage knowledge entries"
  ON public.knowledge_entries FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
