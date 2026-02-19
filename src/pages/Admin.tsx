import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, ArrowLeft, Loader2, Users, FileText, BarChart3, Search, Settings, Eye } from 'lucide-react';
import { format } from 'date-fns';

const Admin = () => {
  const navigate = useNavigate();
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const [users, setUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, totalReports: 0, reportsThisMonth: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
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

      // Fetch all profiles
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, display_name, company_name, phone, created_at')
        .order('created_at', { ascending: false });

      // Fetch all DD reports
      const { data: reportsData } = await supabase
        .from('dd_reports')
        .select('id, address, prepared_for, report_date, status, user_id, created_at')
        .order('created_at', { ascending: false });

      const allUsers = profilesData || [];
      const allReports = reportsData || [];

      setUsers(allUsers);
      setReports(allReports);

      // Calculate stats
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const reportsThisMonth = allReports.filter(r => r.created_at >= monthStart).length;

      setStats({
        totalUsers: allUsers.length,
        totalReports: allReports.length,
        reportsThisMonth,
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

  const filteredReports = reports.filter(r =>
    searchQuery === '' ||
    r.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.prepared_for?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getUserName = (userId: string) => {
    const user = users.find(u => u.user_id === userId);
    return user?.display_name || user?.company_name || userId.slice(0, 8);
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
          </TabsList>

          <TabsContent value="stats">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            </div>
          </TabsContent>

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
                      {userReports.map(r => (
                        <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                          <div>
                            <p className="font-medium">{r.address}</p>
                            <p className="text-sm text-muted-foreground">For: {r.prepared_for} • {format(new Date(r.report_date), 'MMM d, yyyy')}</p>
                          </div>
                          <Badge variant={r.status === 'completed' ? 'default' : r.status === 'error' ? 'destructive' : 'secondary'}>{r.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>All Users ({users.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {users.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No users found.</p>
                  ) : (
                    <div className="space-y-2">
                      {users.map(u => (
                        <div key={u.user_id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                          <div>
                            <p className="font-medium">{u.display_name || 'No name'}</p>
                            <p className="text-sm text-muted-foreground">
                              {u.company_name && `${u.company_name} • `}
                              Joined {format(new Date(u.created_at), 'MMM d, yyyy')}
                            </p>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => handleViewUserReports(u.user_id, u.display_name || u.user_id.slice(0, 8))}>
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

          <TabsContent value="reports">
            <Card>
              <CardHeader>
                <CardTitle>All DD Reports ({filteredReports.length})</CardTitle>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search by address or client..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
                </div>
              </CardHeader>
              <CardContent>
                {filteredReports.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No reports found.</p>
                ) : (
                  <div className="space-y-2">
                    {filteredReports.map(r => (
                      <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                        <div>
                          <p className="font-medium">{r.address}</p>
                          <p className="text-sm text-muted-foreground">
                            For: {r.prepared_for} • By: {getUserName(r.user_id)} • {format(new Date(r.report_date), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <Badge variant={r.status === 'completed' ? 'default' : r.status === 'error' ? 'destructive' : 'secondary'}>{r.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
