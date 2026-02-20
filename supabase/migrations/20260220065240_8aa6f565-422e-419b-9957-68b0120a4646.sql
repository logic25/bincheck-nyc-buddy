
-- 1. Add order_lead_id to dd_reports to trace which lead spawned a report
ALTER TABLE public.dd_reports ADD COLUMN IF NOT EXISTS order_lead_id uuid;

-- 2. Add RLS UPDATE policy on order_leads so admins can mark converted = true
CREATE POLICY "Admins can update order leads"
ON public.order_leads
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. Roadmap items table (admin-only)
CREATE TABLE IF NOT EXISTS public.roadmap_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text DEFAULT 'general' CHECK (category IN ('billing','projects','integrations','operations','general')),
  priority text DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  status text DEFAULT 'backlog' CHECK (status IN ('backlog','in_progress','shipped')),
  ai_tested boolean DEFAULT false,
  ai_evidence text,
  ai_challenges jsonb,
  ai_duplicate_warning text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.roadmap_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything on roadmap_items"
ON public.roadmap_items FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4. AI usage logs table (admin-only read, service role write)
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  feature text NOT NULL,
  model text NOT NULL,
  prompt_tokens int DEFAULT 0,
  completion_tokens int DEFAULT 0,
  total_tokens int DEFAULT 0,
  estimated_cost_usd numeric(10,6) DEFAULT 0,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai_usage_logs"
ON public.ai_usage_logs FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
