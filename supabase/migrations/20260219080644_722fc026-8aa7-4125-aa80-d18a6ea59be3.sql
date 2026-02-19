
-- Create dd_reports table
CREATE TABLE public.dd_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  bin TEXT,
  bbl TEXT,
  prepared_for TEXT NOT NULL DEFAULT '',
  prepared_by TEXT,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  building_data JSONB DEFAULT '{}'::jsonb,
  violations_data JSONB DEFAULT '[]'::jsonb,
  applications_data JSONB DEFAULT '[]'::jsonb,
  orders_data JSONB DEFAULT '{}'::jsonb,
  line_item_notes JSONB DEFAULT '[]'::jsonb,
  general_notes TEXT,
  ai_analysis TEXT,
  pdf_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dd_reports ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own dd reports"
  ON public.dd_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own dd reports"
  ON public.dd_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dd reports"
  ON public.dd_reports FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own dd reports"
  ON public.dd_reports FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_dd_reports_updated_at
  BEFORE UPDATE ON public.dd_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
