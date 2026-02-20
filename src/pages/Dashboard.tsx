import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield, LogOut, RefreshCw, Loader2, Trash2, FileText, Settings,
  ArrowRight, Download, ClipboardList, Clock, CheckCircle2, Search,
} from "lucide-react";
import { getScoreColor } from "@/lib/scoring";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { format } from "date-fns";
import ReportStatusTimeline from "@/components/dd-reports/ReportStatusTimeline";
import DDReportViewer from "@/components/dd-reports/DDReportViewer";

interface ReportRow {
  id: string;
  bin: string;
  address: string;
  compliance_score: number;
  risk_level: string;
  created_at: string;
}

interface DDReportRow {
  id: string;
  address: string;
  status: string;
  customer_concern: string | null;
  created_at: string;
  report_date: string;
  prepared_for: string;
}

const CLIENT_STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
  generating: { label: 'Being Prepared', variant: 'secondary' },
  pending_review: { label: 'Under Review by GLE Team', variant: 'outline' },
  approved: { label: 'Ready to Download', variant: 'default', className: 'bg-emerald-600 text-white border-transparent' },
  draft: { label: 'Draft', variant: 'outline' },
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const [savedReports, setSavedReports] = useState<ReportRow[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate("/auth");
        return;
      }
      setUserId(data.session.user.id);
      setUserEmail(data.session.user.email || null);
      fetchSavedReports();
    };
    check();
  }, []);

  const fetchSavedReports = async () => {
    setLoadingSaved(true);
    const { data, error } = await supabase
      .from("saved_reports")
      .select("id, bin, address, compliance_score, risk_level, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load reports");
    } else {
      setSavedReports(data || []);
    }
    setLoadingSaved(false);
  };

  const { data: ddReports, isLoading: loadingDD, refetch: refetchDD } = useQuery({
    queryKey: ['dashboard-dd-reports', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dd_reports')
        .select('id, address, status, customer_concern, created_at, report_date, prepared_for')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as DDReportRow[];
    },
    enabled: !!userId,
  });

  const { data: selectedReport, isLoading: loadingSelectedReport } = useQuery({
    queryKey: ['dashboard-dd-report-full', selectedReportId],
    queryFn: async () => {
      const { data, error } = await supabase.from('dd_reports').select('*').eq('id', selectedReportId!).single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!selectedReportId,
  });

  const { data: userProfile } = useQuery({
    queryKey: ['dashboard-user-profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('user_id', userId!).single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!userId,
  });

  const handleDeleteSaved = async (id: string) => {
    const { error } = await supabase.from("saved_reports").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete");
    } else {
      setSavedReports(r => r.filter(rep => rep.id !== id));
      toast.success("Report deleted");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  // Summary stats
  const totalDD = ddReports?.length ?? 0;
  const pendingDD = ddReports?.filter(r => r.status === 'generating' || r.status === 'pending_review').length ?? 0;
  const approvedDD = ddReports?.filter(r => r.status === 'approved').length ?? 0;

  const statusInfo = (status: string) => CLIENT_STATUS_LABELS[status] ?? { label: status, variant: 'outline' as const };

  // If a report is selected, show its viewer
  if (selectedReportId) {
    if (loadingSelectedReport) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      );
    }
    if (selectedReport) {
      return (
        <div className="min-h-screen bg-background">
          <header className="border-b border-border/40 sticky top-0 z-50 bg-background/90 backdrop-blur-md">
            <div className="container flex items-center justify-between h-16">
              <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
                <Shield className="h-6 w-6 text-primary" />
                <span className="font-display text-xl tracking-tight">BinCheck<span className="text-primary">NYC</span></span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
                  <Settings className="h-4 w-4 mr-1" /> Settings
                </Button>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut className="h-4 w-4 mr-1" /> Sign Out
                </Button>
              </div>
            </div>
          </header>
          <main className="container py-8 max-w-6xl">
            <DDReportViewer
              report={selectedReport}
              onBack={() => setSelectedReportId(null)}
              onDelete={() => setSelectedReportId(null)}
              clientReadOnly={!isAdmin}
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
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/40 sticky top-0 z-50 bg-background/90 backdrop-blur-md">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <Shield className="h-6 w-6 text-primary" />
            <span className="font-display text-xl tracking-tight">BinCheck<span className="text-primary">NYC</span></span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
              <Settings className="h-4 w-4 mr-1" /> Settings
            </Button>
            {isAdmin && (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate("/dd-reports")}>
                  <FileText className="h-4 w-4 mr-1" /> DD Reports
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
                  <Shield className="h-4 w-4 mr-1" /> Admin
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-1" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 max-w-5xl space-y-8">
        {/* Page title */}
        <div>
          <h1 className="font-display text-3xl font-bold">My Portal</h1>
          <p className="text-muted-foreground mt-1">Your due diligence reports and property searches, all in one place.</p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6 pb-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-display font-bold">{loadingDD ? '—' : totalDD}</p>
                <p className="text-xs text-muted-foreground font-medium">Total Reports</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 pb-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-display font-bold">{loadingDD ? '—' : pendingDD}</p>
                <p className="text-xs text-muted-foreground font-medium">In Progress</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 pb-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-display font-bold">{loadingDD ? '—' : approvedDD}</p>
                <p className="text-xs text-muted-foreground font-medium">Ready to Download</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="reports">
          <TabsList>
            <TabsTrigger value="reports" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /> My Reports
              {totalDD > 0 && <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{totalDD}</span>}
            </TabsTrigger>
            <TabsTrigger value="searches" className="gap-1.5">
              <Search className="h-3.5 w-3.5" /> Quick Searches
              {savedReports.length > 0 && <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded-full">{savedReports.length}</span>}
            </TabsTrigger>
          </TabsList>

          {/* DD Reports Tab */}
          <TabsContent value="reports" className="mt-4 space-y-3">
            {loadingDD ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : !ddReports?.length ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No reports yet</h3>
                  <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                    Your reports will appear here once you've placed an order. Contact GLE to get started.
                  </p>
                </CardContent>
              </Card>
            ) : (
              ddReports.map((r) => {
                const si = statusInfo(r.status);
                const isApproved = r.status === 'approved';
                return (
                  <Card key={r.id} className="overflow-hidden">
                    <CardContent className="p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        {/* Left: info */}
                        <div className="space-y-2 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-base leading-tight">{r.address || 'Unknown Address'}</h3>
                            <Badge
                              variant={si.variant}
                              className={si.className}
                            >
                              {si.label}
                            </Badge>
                          </div>
                          {r.customer_concern && (
                            <p className="text-sm text-muted-foreground italic">"{r.customer_concern}"</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Ordered {format(new Date(r.created_at), 'MMM d, yyyy')}
                          </p>
                          {/* Status timeline */}
                          <div className="pt-1">
                            <ReportStatusTimeline status={r.status} />
                          </div>
                        </div>

                        {/* Right: CTA */}
                        <div className="flex sm:flex-col items-center sm:items-end gap-2 flex-shrink-0">
                          {isApproved ? (
                            <>
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => setSelectedReportId(r.id)}
                              >
                                <Download className="h-3.5 w-3.5 mr-1.5" /> Download PDF
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedReportId(r.id)}
                              >
                                <ArrowRight className="h-3.5 w-3.5 mr-1" /> View Report
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedReportId(r.id)}
                              disabled={r.status === 'generating'}
                            >
                              <ArrowRight className="h-3.5 w-3.5 mr-1" /> View Report
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* Quick Searches Tab */}
          <TabsContent value="searches" className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground">Recent property BIN lookups</p>
              <Button variant="outline" size="sm" onClick={fetchSavedReports}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
              </Button>
            </div>
            {loadingSaved ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : savedReports.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No saved searches yet.</p>
                  <Button className="mt-4" onClick={() => navigate("/")}>Search Properties</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {savedReports.map((r) => (
                  <Card
                    key={r.id}
                    className="hover:bg-card/80 transition-colors cursor-pointer"
                    onClick={() => navigate(`/report?bin=${r.bin}`)}
                  >
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="font-semibold">{r.address || "Unknown"}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">BIN: {r.bin}</span>
                          <span>•</span>
                          <span>{new Date(r.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className={`text-xl font-display font-bold ${getScoreColor(r.compliance_score)}`}>{r.compliance_score}</p>
                          <Badge variant={r.risk_level === 'low' ? 'secondary' : r.risk_level === 'high' ? 'destructive' : 'outline'} className="text-xs">
                            {r.risk_level}
                          </Badge>
                        </div>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDeleteSaved(r.id); }}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Dashboard;
