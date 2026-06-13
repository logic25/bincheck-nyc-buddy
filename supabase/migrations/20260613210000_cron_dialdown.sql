-- ============================================================
-- Migration: Dial down process-email-queue cron from 5s → 1min
-- ============================================================
--
-- Context:
--   The 'process-email-queue' pg_cron job was originally created
--   via the Supabase Management API (ExecuteSQL) with a
--   5-second interval. That's 17,280 invocations/day — wildly
--   over-provisioned for a transactional/auth-email queue.
--
--   Supabase Auth's own email rate limit (1 email per address
--   per 60s) means anything faster than 60s polling is wasted
--   work. We move to 1 minute, which is still well within
--   Resend's free tier limits and gives users sub-minute email
--   delivery (well under the perceived "instant" threshold).
--
--   Cost impact:
--     before: 17,280 ticks/day  (every 5s)
--     after:    1,440 ticks/day  (every 60s)
--     reduction: 12×
--
--   Latency impact:
--     before: email sent ~0-5s after enqueue
--     after:  email sent ~0-60s after enqueue
--     (Resend + inbox delivery already adds 5-30s, so
--      end-user-perceived change is minimal.)
--
-- Strategy:
--   Use cron.alter_job to preserve the job id, body, owner,
--   and database settings configured in the original
--   Management API call. Only the schedule changes.
--
--   If for any reason the job doesn't exist (e.g. fresh env
--   that hasn't run setup_email_infra yet), we skip silently
--   — setup_email_infra will create it at the new cadence
--   once the migration that defines it runs.
-- ============================================================

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid
  FROM cron.job
  WHERE jobname = 'process-email-queue';

  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(
      job_id   := v_jobid,
      schedule := '* * * * *'  -- every 1 minute
    );
    RAISE NOTICE 'process-email-queue cron rescheduled from 5s to 1min (jobid=%)', v_jobid;
  ELSE
    RAISE NOTICE 'process-email-queue cron job not found — skipping (will be created by setup_email_infra at new cadence)';
  END IF;
END $$;
