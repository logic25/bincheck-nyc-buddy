
-- Bug reports table
CREATE TABLE public.bug_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  page TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  loom_url TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- All authenticated users can submit bugs
CREATE POLICY "Users can insert own bug reports" ON public.bug_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Users can view their own bugs
CREATE POLICY "Users can view own bug reports" ON public.bug_reports
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Admins can view all bugs
CREATE POLICY "Admins can view all bug reports" ON public.bug_reports
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update any bug
CREATE POLICY "Admins can update all bug reports" ON public.bug_reports
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Admins can delete any bug
CREATE POLICY "Admins can delete bug reports" ON public.bug_reports
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Bug comments table
CREATE TABLE public.bug_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bug_id UUID NOT NULL REFERENCES public.bug_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  attachments JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bug_comments ENABLE ROW LEVEL SECURITY;

-- Users can insert comments on bugs they can see
CREATE POLICY "Authenticated users can insert comments" ON public.bug_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Users can view comments on their own bugs
CREATE POLICY "Users can view comments on own bugs" ON public.bug_comments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.bug_reports WHERE id = bug_id AND user_id = auth.uid())
  );

-- Admins can view all comments
CREATE POLICY "Admins can view all comments" ON public.bug_comments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Storage bucket for bug attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('bug-attachments', 'bug-attachments', true);

-- Storage policies
CREATE POLICY "Authenticated users can upload bug attachments" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'bug-attachments');

CREATE POLICY "Anyone can view bug attachments" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'bug-attachments');

-- Updated_at trigger
CREATE TRIGGER update_bug_reports_updated_at
  BEFORE UPDATE ON public.bug_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
