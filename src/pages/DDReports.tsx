import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  FileText, Plus, Search, AlertTriangle, Loader2, Eye, Trash2, Clock, Shield, ArrowLeft, LogOut
} from 'lucide-react';
import { format } from 'date-fns';
import DDReportViewer from '@/components/dd-reports/DDReportViewer';
import CreateDDReportDialog from '@/components/dd-reports/CreateDDReportDialog';

interface DDReport {
  id: string;
  address: string;
  bin: string | null;
  bbl: string | null;
  prepared_for: string;
  prepared_by: string | null;
  report_date: string;
  status: string;
  building_data: any;
  violations_data: any;
  applications_data: any;
  orders_data: any;
  line_item_notes: any[];
  general_notes: string | null;
  ai_analysis: string | null;
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
}

const DDReports = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate('/auth');
        return;
      }
      setUserId(data.session.user.id);
      setUserEmail(data.session.user.email || null);
    };
    check();
  }, []);

  const { data: userProfile } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('user_id', userId!).single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: reports, isLoading } = useQuery({
    queryKey: ['dd-reports', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dd_reports')
        .select('id, address, prepared_for, report_date, status, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: selectedReport, isLoading: isLoadingReport } = useQuery({
    queryKey: ['dd-report', selectedReportId],
    queryFn: async () => {
      const { data, error } = await supabase.from('dd_reports').select('*').eq('id', selectedReportId!).single();
      if (error) throw error;
      return data as unknown as DDReport;
    },
    enabled: !!selectedReportId,
  });

  const deleteReport = useMutation({
    mutationFn: async (reportId: string) => {
      const { error } = await supabase.from('dd_reports').delete().eq('id', reportId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dd-reports'] });
      toast.success('Report deleted');
      if (selectedReportId) setSelectedReportId(null);
    },
    onError: () => toast.error('Failed to delete report'),
  });

  const regenerateReport = useMutation({
    mutationFn: async ({ reportId, address }: { reportId: string; address: string }) => {
      const { error } = await supabase.functions.invoke('generate-dd-report', {
        body: { reportId, address },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dd-reports'] });
      queryClient.invalidateQueries({ queryKey: ['dd-report', selectedReportId] });
      toast.success('Report regenerated');
    },
    onError: () => toast.error('Failed to regenerate report'),
  });

  const filteredReports = reports?.filter(report =>
    searchQuery === '' ||
    (report as any).address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (report as any).prepared_for?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'completed': return 'default' as const;
      case 'generating': return 'secondary' as const;
      case 'error': return 'destructive' as const;
      default: return 'outline' as const;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <FileText className="w-4 h-4" />;
      case 'generating': return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'error': return <AlertTriangle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  if (isLoadingReport && selectedReportId) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
          <div className="container flex items-center h-16">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
              <Shield className="h-6 w-6 text-primary" />
              <span className="font-display text-xl tracking-tight">BinCheck<span className="text-primary">NYC</span></span>
            </div>
          </div>
        </header>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (selectedReport && selectedReportId) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
          <div className="container flex items-center h-16">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
              <Shield className="h-6 w-6 text-primary" />
              <span className="font-display text-xl tracking-tight">BinCheck<span className="text-primary">NYC</span></span>
            </div>
          </div>
        </header>
        <main className="container py-8 max-w-6xl">
          <DDReportViewer
            report={selectedReport}
            onBack={() => setSelectedReportId(null)}
            onDelete={() => deleteReport.mutate(selectedReport.id)}
            onRegenerate={(reportId, address) => regenerateReport.mutate({ reportId, address })}
            isRegenerating={regenerateReport.isPending}
            userProfile={{
              email: userEmail,
              display_name: userProfile?.display_name || null,
              company_name: null,
              phone: null,
              license_id: null,
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <Shield className="h-6 w-6 text-primary" />
            <span className="font-display text-xl tracking-tight">BinCheck<span className="text-primary">NYC</span></span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-1" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Due Diligence Reports</h1>
            <p className="text-muted-foreground mt-1">Transaction-ready property risk reports for attorneys, investors, and deal teams</p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Report
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by address or client..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" /> Your Reports ({filteredReports?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : !filteredReports?.length ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-1">No reports yet</h3>
                <p className="text-muted-foreground mb-4">Generate your first DD report to share with counsel or transaction stakeholders.</p>
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" /> Create Report
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredReports.map((report: any) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedReportId(report.id)}
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        {getStatusIcon(report.status)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium">{report.address}</h3>
                          <Badge variant={getStatusVariant(report.status)}>{report.status}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>Prepared for: {report.prepared_for}</span>
                          <span>•</span>
                          <span>{format(new Date(report.report_date), 'MMM d, yyyy')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="w-4 h-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => e.stopPropagation()}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Report</AlertDialogTitle>
                            <AlertDialogDescription>Delete "{report.address}"? This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteReport.mutate(report.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <CreateDDReportDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSuccess={(report) => {
            setSelectedReportId(report.id);
            setCreateDialogOpen(false);
          }}
        />
      </main>
    </div>
  );
};

export default DDReports;
