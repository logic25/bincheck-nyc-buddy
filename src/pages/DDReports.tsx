import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  FileText, Plus, Search, AlertTriangle, Loader2, Eye, Trash2, Clock,
  Shield, ArrowLeft, LogOut, Settings, Zap, Inbox, Phone, Mail, Building2, BookOpen,
} from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
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
  rush_requested?: boolean;
  requested_delivery_date?: string | null;
  payment_status?: string | null;
  client_firm?: string | null;
}

interface OrderLead {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  phone: string | null;
  address: string | null;
  concern: string | null;
  rush_requested: boolean | null;
  requested_delivery_date: string | null;
  created_at: string;
  converted: boolean | null;
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
  approved: { label: 'Approved', variant: 'default', className: 'bg-emerald-600 text-white border-transparent' },
  pending_review: { label: 'Pending Review', variant: 'outline', className: 'border-amber-500 text-amber-500' },
  generating: { label: 'Generating', variant: 'secondary' },
  error: { label: 'Error', variant: 'destructive' },
  draft: { label: 'Draft', variant: 'outline' },
};

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'generating', label: 'Generating' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'error', label: 'Error' },
];

const DDReports = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mainTab, setMainTab] = useState<'incoming' | 'reports'>('incoming');
  const [statusTab, setStatusTab] = useState('pending_review');
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [startingReportId, setStartingReportId] = useState<string | null>(null);
  const { isAdmin, isLoading: roleLoading } = useUserRole();

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { navigate('/auth'); return; }
      setUserId(data.session.user.id);
      setUserEmail(data.session.user.email || null);
    };
    check();
  }, []);

  useEffect(() => {
    if (!roleLoading && !isAdmin) navigate('/dashboard');
  }, [isAdmin, roleLoading, navigate]);

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
        .select('id, address, prepared_for, prepared_by, report_date, status, created_at, rush_requested, requested_delivery_date, payment_status, client_firm')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: incomingOrders, isLoading: loadingIncoming } = useQuery({
    queryKey: ['incoming-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_leads')
        .select('*')
        .eq('converted', false)
        .order('created_at', { ascending: true }); // oldest first = most urgent
      if (error) throw error;
      return (data || []) as OrderLead[];
    },
    enabled: !!userId,
  });

  // Default to "incoming" if there are unconverted leads, otherwise "reports"
  useEffect(() => {
    if (incomingOrders !== undefined) {
      setMainTab(incomingOrders.length > 0 ? 'incoming' : 'reports');
    }
  }, [incomingOrders]);

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

  const startReport = useMutation({
    mutationFn: async (lead: OrderLead) => {
      if (!userId) throw new Error('Not authenticated');

      // 1. Create the dd_reports row pre-filled from lead data
      const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email;
      const { data: newReport, error: insertError } = await supabase
        .from('dd_reports')
        .insert({
          address: lead.address || '',
          prepared_for: fullName,
          client_email: lead.email,
          client_firm: lead.company || null,
          rush_requested: lead.rush_requested || false,
          requested_delivery_date: lead.requested_delivery_date || null,
          customer_concern: lead.concern || null,
          status: 'generating',
          order_lead_id: lead.id,
          user_id: userId,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // 2. Mark lead as converted
      const { error: updateError } = await supabase
        .from('order_leads')
        .update({ converted: true })
        .eq('id', lead.id);

      if (updateError) throw updateError;

      // 3. Invoke generate-dd-report
      await supabase.functions.invoke('generate-dd-report', {
        body: { reportId: newReport.id, address: lead.address || '' },
      });

      return newReport.id;
    },
    onSuccess: (newReportId) => {
      queryClient.invalidateQueries({ queryKey: ['dd-reports'] });
      queryClient.invalidateQueries({ queryKey: ['incoming-orders'] });
      toast.success('Report started — generating now');
      setStartingReportId(null);
      setSelectedReportId(newReportId);
    },
    onError: (err) => {
      toast.error('Failed to start report: ' + (err instanceof Error ? err.message : 'Unknown error'));
      setStartingReportId(null);
    },
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  // Filter by tab + search
  const filteredReports = (() => {
    let base = reports || [];
    if (statusTab !== 'all') base = base.filter((r: any) => r.status === statusTab);
    if (searchQuery) base = base.filter((r: any) =>
      r.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.prepared_for?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.client_firm?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (statusTab === 'pending_review') {
      return [...base].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
    return base;
  })();

  const countFor = (tab: string) => {
    if (tab === 'all') return reports?.length || 0;
    return reports?.filter((r: any) => r.status === tab).length || 0;
  };

  const getStatusConfig = (status: string) => STATUS_CONFIG[status] ?? { label: status, variant: 'outline' as const };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <FileText className="w-4 h-4 text-emerald-500" />;
      case 'generating': return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
      case 'error': return <AlertTriangle className="w-4 h-4 text-destructive" />;
      default: return <Clock className="w-4 h-4 text-amber-500" />;
    }
  };

  if (isLoadingReport && selectedReportId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
            <Button variant="ghost" size="sm" onClick={() => navigate('/settings')}>
              <Settings className="h-4 w-4 mr-1" /> Settings
            </Button>
            {isAdmin && (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>
                  <Shield className="h-4 w-4 mr-1" /> Admin
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/help')}>
                  <BookOpen className="h-4 w-4 mr-1" /> Help Center
                </Button>
              </>
            )}
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
            <p className="text-muted-foreground mt-1">Transaction-ready property risk reports — work queue</p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Report
          </Button>
        </div>

        {/* Main tabs: Incoming Orders vs Reports */}
        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as 'incoming' | 'reports')}>
          <TabsList className="h-auto">
            <TabsTrigger value="incoming" className="gap-1.5">
              <Inbox className="h-4 w-4" />
              Incoming Orders
              {(incomingOrders?.length ?? 0) > 0 && (
                <span className="ml-1 text-xs bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-full font-semibold">
                  {incomingOrders!.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-1.5">
              <FileText className="h-4 w-4" />
              Reports Queue
              {(reports?.length ?? 0) > 0 && (
                <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded-full">{reports!.length}</span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── INCOMING ORDERS TAB ── */}
          <TabsContent value="incoming" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Inbox className="w-5 h-5 text-primary" />
                  Incoming Orders ({incomingOrders?.length ?? 0})
                  <span className="text-xs text-muted-foreground font-normal ml-2">· sorted oldest first (most urgent)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingIncoming ? (
                  <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
                ) : !incomingOrders?.length ? (
                  <div className="text-center py-12">
                    <Inbox className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-1">No incoming orders</h3>
                    <p className="text-muted-foreground text-sm">All orders have been actioned. New orders will appear here automatically.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {incomingOrders.map((lead) => (
                      <div key={lead.id} className="p-4 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1 space-y-2">
                            {/* Header row */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {lead.rush_requested && (
                                <Badge className="bg-destructive text-destructive-foreground text-xs shrink-0">
                                  <Zap className="h-3 w-3 mr-0.5" /> RUSH
                                </Badge>
                              )}
                              <h3 className="font-semibold truncate">{lead.address || 'Address not provided'}</h3>
                            </div>

                            {/* Contact info */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground">
                              <span className="font-medium text-foreground">
                                {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Name not provided'}
                              </span>
                              {lead.company && (
                                <span className="flex items-center gap-1">
                                  <Building2 className="h-3.5 w-3.5 shrink-0" /> {lead.company}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Mail className="h-3.5 w-3.5 shrink-0" /> {lead.email}
                              </span>
                              {lead.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3.5 w-3.5 shrink-0" /> {lead.phone}
                                </span>
                              )}
                            </div>

                            {/* Dates */}
                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                              <span>Submitted {format(new Date(lead.created_at), 'MMM d, yyyy h:mm a')}</span>
                              {lead.requested_delivery_date && (
                                <span className={lead.rush_requested ? 'text-destructive font-semibold' : ''}>
                                  · Expected by {format(new Date(lead.requested_delivery_date), 'MMM d, yyyy')}
                                </span>
                              )}
                            </div>

                            {/* Concern */}
                            {lead.concern && (
                              <p className="text-sm italic text-muted-foreground border-l-2 border-primary/30 pl-3 mt-1">
                                "{lead.concern}"
                              </p>
                            )}
                          </div>

                          {/* Start Report button */}
                          <div className="shrink-0">
                            <Button
                              size="sm"
                              disabled={startingReportId === lead.id || startReport.isPending}
                              onClick={() => {
                                setStartingReportId(lead.id);
                                startReport.mutate(lead);
                              }}
                              className="whitespace-nowrap"
                            >
                              {startingReportId === lead.id ? (
                                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Starting…</>
                              ) : (
                                <><FileText className="h-3.5 w-3.5 mr-1.5" /> Start Report</>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── REPORTS QUEUE TAB ── */}
          <TabsContent value="reports" className="mt-4 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by address, client, or firm..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>

            {/* Status filter tabs */}
            <Tabs value={statusTab} onValueChange={setStatusTab}>
              <TabsList className="flex-wrap h-auto">
                {STATUS_TABS.map(tab => (
                  <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
                    {tab.label}
                    <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded-full">{countFor(tab.value)}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value={statusTab} className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      {STATUS_TABS.find(t => t.value === statusTab)?.label} ({filteredReports.length})
                      {statusTab === 'pending_review' && (
                        <span className="text-xs text-muted-foreground font-normal ml-2">· sorted oldest first</span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
                    ) : filteredReports.length === 0 ? (
                      <div className="text-center py-12">
                        <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium mb-1">No reports</h3>
                        <p className="text-muted-foreground mb-4 text-sm">
                          {statusTab === 'all' ? "Generate your first DD report." : `No reports with status "${statusTab}".`}
                        </p>
                        {statusTab === 'all' && (
                          <Button onClick={() => setCreateDialogOpen(true)}>
                            <Plus className="w-4 h-4 mr-2" /> Create Report
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {filteredReports.map((report: any) => {
                          const sc = getStatusConfig(report.status);
                          const isRush = report.rush_requested;
                          const isPaid = report.payment_status === 'paid';
                          return (
                            <div
                              key={report.id}
                              className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                              onClick={() => setSelectedReportId(report.id)}
                            >
                              <div className="flex items-start gap-4 min-w-0 flex-1">
                                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                                  {getStatusIcon(report.status)}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    {isRush && (
                                      <Badge className="bg-destructive text-destructive-foreground text-xs shrink-0">
                                        <Zap className="h-3 w-3 mr-0.5" /> RUSH
                                      </Badge>
                                    )}
                                    <h3 className="font-medium truncate">{report.address}</h3>
                                    <Badge variant={sc.variant} className={sc.className}>{sc.label}</Badge>
                                    {isPaid && <Badge variant="outline" className="border-emerald-500 text-emerald-500 text-xs">Paid</Badge>}
                                    {report.payment_status && report.payment_status !== 'paid' && (
                                      <Badge variant="outline" className="text-xs text-muted-foreground">Unpaid</Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                                    <span>{report.prepared_for}</span>
                                    {report.client_firm && <><span>·</span><span>{report.client_firm}</span></>}
                                    <span>·</span>
                                    <span>{format(new Date(report.report_date), 'MMM d, yyyy')}</span>
                                    {isRush && report.requested_delivery_date && (
                                      <><span>·</span><span className="text-destructive font-medium">Due {report.requested_delivery_date}</span></>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setSelectedReportId(report.id); }}>
                                  <Eye className="w-4 h-4" />
                                </Button>
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
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>

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
