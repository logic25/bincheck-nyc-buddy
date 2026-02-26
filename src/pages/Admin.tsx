import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, ArrowLeft, Loader2, Users, FileText, BarChart3, Search, Settings, Eye, Mail, Building2, BookOpen, Pencil, Brain } from 'lucide-react';
import { format } from 'date-fns';
import EditReviewTab from '@/components/admin/EditReviewTab';
import AILearningTab from '@/components/admin/AILearningTab';

interface UserWithEmail {
  user_id: string;
  display_name: string | null;
  company_name: string | null;
  phone: string | null;
  profile_created_at: string;
  email: string | null;
  auth_created_at: string | null;
}

const Admin = () => {
  const navigate = useNavigate();
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const [users, setUsers] = useState<UserWithEmail[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, totalReports: 0, reportsThisMonth: 0, totalLeads: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [selectedUserReports, setSelectedUserReports] = useState<{ userId: string; name: string } | null>(null);
  const [userReports, setUserReports] = useState<any[]>([]);
  const [loadingUserReports, setLoadingUserReports] = useState(false);

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      navigate('/dashboard');
    }
  }, [roleLoading, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const fetchData = async () => {
      setLoading(true);

      // Fetch profiles
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, display_name, company_name, phone, created_at')
        .order('created_at', { ascending: false });

      // Fetch auth emails via security-definer function
      const { data: authUsersData } = await supabase.rpc('get_users_with_email');

      // Merge profiles with auth emails
      const emailMap: Record<string, { email: string; created_at: string }> = {};
      (authUsersData || []).forEach((u: any) => {
        emailMap[u.user_id] = { email: u.email, created_at: u.created_at };
      });

      const merged: UserWithEmail[] = (profilesData || []).map((p: any) => ({
        user_id: p.user_id,
        display_name: p.display_name,
        company_name: p.company_name,
        phone: p.phone,
        profile_created_at: p.created_at,
        email: emailMap[p.user_id]?.email || null,
        auth_created_at: emailMap[p.user_id]?.created_at || null,
      }));

      // Fetch all DD reports
      const { data: reportsData } = await supabase
        .from('dd_reports')
        .select('id, address, prepared_for, report_date, status, user_id, created_at, rush_requested, client_email, client_firm')
        .order('created_at', { ascending: false });

      // Fetch order leads
      const { data: leadsData } = await supabase
        .from('order_leads' as any)
        .select('*')
        .order('created_at', { ascending: false });

      const allReports = reportsData || [];

      setUsers(merged);
      setReports(allReports);
      setLeads(leadsData || []);

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const reportsThisMonth = allReports.filter(r => r.created_at >= monthStart).length;

      setStats({
        totalUsers: merged.length,
        totalReports: allReports.length,
        reportsThisMonth,
        totalLeads: (leadsData || []).length,
      });

      setLoading(false);
    };
    fetchData();
  }, [isAdmin]);

  const handleViewUserReports = async (userId: string, name: string) => {
    setSelectedUserReports({ userId, name });
    setLoadingUserReports(true);
    const { data } = await supabase
      .from('dd_reports')
      .select('id, address, prepared_for, report_date, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    setUserReports(data || []);
    setLoadingUserReports(false);
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: any }> = {
      approved: { label: 'Approved', variant: 'default' },
      pending_review: { label: 'Pending Review', variant: 'secondary' },
      generating: { label: 'Generating', variant: 'outline' },
      error: { label: 'Error', variant: 'destructive' },
      draft: { label: 'Draft', variant: 'outline' },
    };
    return map[status] || { label: status, variant: 'outline' };
  };

  const filteredReports = reports.filter(r =>
    searchQuery === '' ||
    r.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.prepared_for?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.client_email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredLeads = leads.filter((l: any) =>
    leadSearch === '' ||
    l.email?.toLowerCase().includes(leadSearch.toLowerCase()) ||
    l.first_name?.toLowerCase().includes(leadSearch.toLowerCase()) ||
    l.last_name?.toLowerCase().includes(leadSearch.toLowerCase()) ||
    l.company?.toLowerCase().includes(leadSearch.toLowerCase())
  );

  const getUserDisplayName = (user: UserWithEmail) => {
    return user.display_name || user.email?.split('@')[0] || user.user_id.slice(0, 8);
  };

  if (roleLoading || (loading && isAdmin)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/40 sticky top-0 z-50 bg-background/90 backdrop-blur-md">
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
            <Button variant="ghost" size="sm" onClick={() => navigate('/dd-reports')}>
              <FileText className="h-4 w-4 mr-1" /> DD Reports
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/help')}>
              <BookOpen className="h-4 w-4 mr-1" /> Help Center
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 max-w-5xl space-y-6">
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          <h1 className="font-display text-2xl font-bold">Admin Panel</h1>
        </div>

        <Tabs defaultValue="stats">
          <TabsList>
            <TabsTrigger value="stats"><BarChart3 className="h-4 w-4 mr-1" /> Stats</TabsTrigger>
            <TabsTrigger value="users"><Users className="h-4 w-4 mr-1" /> Users</TabsTrigger>
             <TabsTrigger value="reports"><FileText className="h-4 w-4 mr-1" /> All Reports</TabsTrigger>
            <TabsTrigger value="leads"><Mail className="h-4 w-4 mr-1" /> Leads</TabsTrigger>
            <TabsTrigger value="edit-review"><Pencil className="h-4 w-4 mr-1" /> Edit Review</TabsTrigger>
            <TabsTrigger value="ai-learning"><Brain className="h-4 w-4 mr-1" /> AI Learning</TabsTrigger>
          </TabsList>

          {/* Stats */}
          <TabsContent value="stats">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Users</CardDescription>
                  <CardTitle className="text-3xl">{stats.totalUsers}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total DD Reports</CardDescription>
                  <CardTitle className="text-3xl">{stats.totalReports}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Reports This Month</CardDescription>
                  <CardTitle className="text-3xl">{stats.reportsThisMonth}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Order Leads</CardDescription>
                  <CardTitle className="text-3xl">{stats.totalLeads}</CardTitle>
                </CardHeader>
              </Card>
            </div>
          </TabsContent>

          {/* Users */}
          <TabsContent value="users">
            {selectedUserReports ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Reports by {selectedUserReports.name}</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedUserReports(null)}>
                      <ArrowLeft className="h-4 w-4 mr-1" /> Back to Users
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingUserReports ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                  ) : userReports.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No reports found for this user.</p>
                  ) : (
                    <div className="space-y-2">
                      {userReports.map(r => {
                        const s = getStatusBadge(r.status);
                        return (
                          <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                            <div>
                              <p className="font-medium">{r.address}</p>
                              <p className="text-sm text-muted-foreground">For: {r.prepared_for} · {format(new Date(r.report_date), 'MMM d, yyyy')}</p>
                            </div>
                            <Badge variant={s.variant}>{s.label}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>All Users ({users.length})</CardTitle>
                  <CardDescription>Registered accounts with email and signup date</CardDescription>
                </CardHeader>
                <CardContent>
                  {users.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No users found.</p>
                  ) : (
                    <div className="space-y-2">
                      {users.map(u => (
                        <div key={u.user_id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium truncate">{getUserDisplayName(u)}</p>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                              {u.email && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Mail className="h-3 w-3" /> {u.email}
                                </span>
                              )}
                              {u.company_name && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Building2 className="h-3 w-3" /> {u.company_name}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                Signed up {u.auth_created_at ? format(new Date(u.auth_created_at), 'MMM d, yyyy') : format(new Date(u.profile_created_at), 'MMM d, yyyy')}
                              </span>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => handleViewUserReports(u.user_id, getUserDisplayName(u))}>
                            <Eye className="h-4 w-4 mr-1" /> Reports
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* All Reports */}
          <TabsContent value="reports">
            <Card>
              <CardHeader>
                <CardTitle>All DD Reports ({filteredReports.length})</CardTitle>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search by address, client, or email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
                </div>
              </CardHeader>
              <CardContent>
                {filteredReports.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No reports found.</p>
                ) : (
                  <div className="space-y-2">
                    {filteredReports.map(r => {
                      const s = getStatusBadge(r.status);
                      return (
                        <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              {r.rush_requested && <Badge variant="destructive" className="text-xs">🚨 RUSH</Badge>}
                              <p className="font-medium truncate">{r.address}</p>
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {r.prepared_for}
                              {r.client_firm && ` · ${r.client_firm}`}
                              {r.client_email && ` · ${r.client_email}`}
                              {' · '}{format(new Date(r.created_at), 'MMM d, yyyy')}
                            </p>
                          </div>
                          <Badge variant={s.variant}>{s.label}</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Leads */}
          <TabsContent value="leads">
            <Card>
              <CardHeader>
                <CardTitle>Order Leads ({filteredLeads.length})</CardTitle>
                <CardDescription>Emails captured from the order form — including abandoned orders</CardDescription>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search by email, name, or company..." value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)} className="pl-10" />
                </div>
              </CardHeader>
              <CardContent>
                {filteredLeads.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No leads captured yet.</p>
                ) : (
                  <div className="space-y-2">
                    {filteredLeads.map((l: any) => (
                      <div key={l.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{l.first_name} {l.last_name}</p>
                            {l.converted && <Badge className="text-xs bg-primary text-primary-foreground border-transparent">Converted</Badge>}
                            {l.rush_requested && <Badge variant="destructive" className="text-xs">RUSH</Badge>}
                          </div>
                          <div className="flex items-center gap-3 flex-wrap mt-0.5">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3" /> {l.email}
                            </span>
                            {l.company && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Building2 className="h-3 w-3" /> {l.company}
                              </span>
                            )}
                            {l.address && <span className="text-xs text-muted-foreground truncate max-w-48">{l.address}</span>}
                          </div>
                        </div>
                        <div className="text-right ml-4 shrink-0">
                          <Badge variant="outline" className="text-xs">Step {l.step_reached}</Badge>
                          <p className="text-xs text-muted-foreground mt-1">{format(new Date(l.created_at), 'MMM d, yyyy')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Edit Review */}
          <TabsContent value="edit-review">
            <EditReviewTab />
          </TabsContent>

          {/* AI Learning */}
          <TabsContent value="ai-learning">
            <AILearningTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
