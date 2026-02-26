import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Shield, LogOut, Loader2, Trash2, FileText, Settings, RefreshCw,
  ArrowRight, Download, ClipboardList, Clock, CheckCircle2, Search, MapPin, Package, BookOpen,
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
  pending_review: { label: 'Under Review', variant: 'outline' },
  approved: { label: 'Ready to Download', variant: 'default', className: 'bg-emerald-600 text-white border-transparent' },
  draft: { label: 'Draft', variant: 'outline' },
};

interface GeoSuggestion {
  label: string;
}

const Dashboard = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const [savedReports, setSavedReports] = useState<ReportRow[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Quick search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<GeoSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchWrapperRef = useRef<HTMLFormElement>(null);

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

  // Geo search autocomplete
  const fetchSearchSuggestions = useCallback(async (text: string) => {
    if (text.length < 3 || /^\d+$/.test(text.trim())) {
      setSearchSuggestions([]);
      return;
    }
    try {
      const res = await fetch(
        `https://geosearch.planninglabs.nyc/v2/autocomplete?text=${encodeURIComponent(text)}&size=6`
      );
      if (!res.ok) return;
      const data = await res.json();
      const results: GeoSuggestion[] = (data.features || []).map((f: any) => ({
        label: f.properties?.label || f.properties?.name || "",
      }));
      setSearchSuggestions(results);
      setShowSuggestions(results.length > 0);
      setHighlightedIndex(-1);
    } catch {
      setSearchSuggestions([]);
    }
  }, []);

  const handleSearchInputChange = (value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => fetchSearchSuggestions(value), 200);
  };

  const selectSearchSuggestion = (label: string) => {
    setSearchQuery(label);
    setShowSuggestions(false);
    setSearchSuggestions([]);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setShowSuggestions(false);
    const isNumeric = /^\d+$/.test(searchQuery.trim());
    navigate(`/report?${isNumeric ? "bin" : "address"}=${encodeURIComponent(searchQuery.trim())}`);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || searchSuggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex(i => (i < searchSuggestions.length - 1 ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(i => (i > 0 ? i - 1 : searchSuggestions.length - 1));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      selectSearchSuggestion(searchSuggestions[highlightedIndex].label);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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
    queryKey: ['dashboard-dd-reports', userId, userEmail, isAdmin],
    queryFn: async () => {
      if (isAdmin) {
        // Admins see ALL reports
        const { data, error } = await supabase
          .from('dd_reports')
          .select('id, address, status, customer_concern, created_at, report_date, prepared_for')
          .order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []) as DDReportRow[];
      }

      // Clients see only their own reports (by user_id via RLS) + reports where client_email matches
      const { data: ownedReports, error: e1 } = await supabase
        .from('dd_reports')
        .select('id, address, status, customer_concern, created_at, report_date, prepared_for')
        .order('created_at', { ascending: false });
      if (e1) throw e1;

      let clientReports: DDReportRow[] = [];
      if (userEmail) {
        const { data: emailReports, error: e2 } = await supabase
          .from('dd_reports')
          .select('id, address, status, customer_concern, created_at, report_date, prepared_for')
          .eq('client_email', userEmail)
          .order('created_at', { ascending: false });
        if (!e2 && emailReports) {
          const ownedIds = new Set((ownedReports || []).map(r => r.id));
          clientReports = (emailReports as DDReportRow[]).filter(r => !ownedIds.has(r.id));
        }
      }

      return [...(ownedReports || []), ...clientReports] as DDReportRow[];
    },
    enabled: !!userId && !roleLoading,
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

  // Pending orders from order_leads (email match, not yet converted to a dd_report)
  const { data: pendingOrders } = useQuery({
    queryKey: ['dashboard-pending-orders', userEmail],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_leads')
        .select('id, address, first_name, last_name, created_at, rush_requested, requested_delivery_date, converted')
        .eq('email', userEmail!)
        .eq('converted', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!userEmail,
  });

  const regenerateReport = useMutation({
    mutationFn: async ({ reportId, address }: { reportId: string; address: string }) => {
      const { error } = await supabase.functions.invoke('generate-dd-report', {
        body: { reportId, address },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-dd-reports'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-dd-report-full', selectedReportId] });
      toast.success('Report regenerated');
    },
    onError: () => toast.error('Failed to regenerate report'),
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
  const generatingDD = ddReports?.filter(r => r.status === 'generating').length ?? 0;
  const pendingReviewDD = ddReports?.filter(r => r.status === 'pending_review').length ?? 0;
  const pendingDD = generatingDD + pendingReviewDD;
  const approvedDD = ddReports?.filter(r => r.status === 'approved').length ?? 0;

  // For clients: reports relevant to them
  const clientReports = isAdmin ? [] : (ddReports || []);
  // For admins: reports needing action
  const adminActionItems = isAdmin ? (ddReports || []).filter(r => r.status === 'pending_review' || r.status === 'generating') : [];

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
              onRegenerate={(reportId, address) => regenerateReport.mutate({ reportId, address })}
              isRegenerating={regenerateReport.isPending}
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
            <Button size="sm" onClick={() => navigate("/order")}>
              Order a Report <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
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
                <Button variant="ghost" size="sm" onClick={() => navigate("/help")}>
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

      <main className="container py-8 max-w-5xl space-y-8">
        {/* Page title */}
        <div>
          <h1 className="font-display text-3xl font-bold">{isAdmin ? 'Admin Dashboard' : 'My Portal'}</h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin
              ? 'Manage reports, review orders, and run property searches.'
              : 'Your due diligence reports and property searches, all in one place.'}
          </p>
        </div>

        {/* Stat Cards — role-aware */}
        <div className={`grid grid-cols-1 gap-4 ${isAdmin ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
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
          {isAdmin && (
            <Card className="border-amber-500/30">
              <CardContent className="pt-6 pb-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold">{loadingDD ? '—' : pendingReviewDD}</p>
                  <p className="text-xs text-muted-foreground font-medium">Needs Review</p>
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="pt-6 pb-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-display font-bold">{loadingDD ? '—' : isAdmin ? generatingDD : pendingDD}</p>
                <p className="text-xs text-muted-foreground font-medium">{isAdmin ? 'Generating' : 'In Progress'}</p>
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
                <p className="text-xs text-muted-foreground font-medium">{isAdmin ? 'Approved' : 'Ready to Download'}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Admin: Work Queue — reports needing action */}
        {isAdmin && adminActionItems.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h2 className="font-semibold text-sm">Needs Attention</h2>
                <Badge variant="destructive" className="text-xs">{adminActionItems.length}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate("/dd-reports")}>
                View All <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
            {adminActionItems.slice(0, 5).map((r) => {
              const si = statusInfo(r.status);
              return (
                <Card key={r.id} className="border-primary/20 hover:border-primary/40 transition-colors cursor-pointer" onClick={() => setSelectedReportId(r.id)}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{r.address || 'Unknown Address'}</p>
                        <Badge variant={si.variant} className={si.className}>{si.label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {r.prepared_for} · {format(new Date(r.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      <ArrowRight className="h-3.5 w-3.5 mr-1" /> Review
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
            {adminActionItems.length > 5 && (
              <p className="text-xs text-muted-foreground text-center">
                + {adminActionItems.length - 5} more — <button className="underline" onClick={() => navigate("/dd-reports")}>view all</button>
              </p>
            )}
          </div>
        )}

        {/* Pending Orders — with 4-stage progress bar */}
        {pendingOrders && pendingOrders.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-amber-500" />
              <h2 className="font-semibold text-sm">Pending Orders</h2>
              <Badge variant="outline" className="text-xs">{pendingOrders.length}</Badge>
            </div>
            {pendingOrders.map((order) => (
              <Card key={order.id} className="border-amber-500/30 bg-amber-500/5">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm truncate">{order.address || 'Address pending'}</p>
                        {order.rush_requested && (
                          <Badge className="bg-destructive text-destructive-foreground text-xs">RUSH</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Submitted {format(new Date(order.created_at), 'MMM d, yyyy')}
                        {order.requested_delivery_date && ` · Expected by ${format(new Date(order.requested_delivery_date), 'MMM d')}`}
                      </p>
                    </div>
                  </div>
                  {/* 4-stage progress tracker — "generating" while order is not yet converted */}
                  <ReportStatusTimeline status="generating" className="pt-1" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

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
                <CardContent className="py-16 text-center space-y-4">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
                  <div>
                    <h3 className="text-lg font-semibold mb-1">No reports yet</h3>
                    <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                      Your due diligence reports will appear here once you've placed an order.
                    </p>
                  </div>
                  <Button onClick={() => navigate("/order")}>
                    Order a Report <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
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
          <TabsContent value="searches" className="mt-4 space-y-4">
            {/* Inline address search */}
            <form onSubmit={handleSearchSubmit} className="relative" ref={searchWrapperRef}>
              <div className="relative flex items-center bg-card border border-border rounded-lg overflow-visible shadow-sm">
                <Search className="h-5 w-5 text-muted-foreground ml-4 shrink-0" />
                <Input
                  value={searchQuery}
                  onChange={(e) => handleSearchInputChange(e.target.value)}
                  onFocus={() => searchSuggestions.length > 0 && setShowSuggestions(true)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Enter BIN number or NYC address..."
                  className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base h-12 pl-3"
                  autoComplete="off"
                />
                <Button type="submit" size="sm" className="m-1.5 shrink-0 font-semibold">
                  Search
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>

              {/* Autocomplete dropdown */}
              {showSuggestions && searchSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                  {searchSuggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                        i === highlightedIndex ? "bg-muted" : "hover:bg-muted/50"
                      }`}
                      onClick={() => selectSearchSuggestion(s.label)}
                      onMouseEnter={() => setHighlightedIndex(i)}
                    >
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate text-foreground">{s.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </form>

            {/* Past searches list */}
            {loadingSaved ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : savedReports.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No past searches yet — search above to get started.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Recent BIN lookups</p>
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
