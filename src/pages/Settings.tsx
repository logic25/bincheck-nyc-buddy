import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Shield, ArrowLeft, Loader2, Save, LogOut, KeyRound, User, CreditCard, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';

const Settings = () => {
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState({
    display_name: '',
    company_name: '',
    phone: '',
    license_id: '',
  });

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/auth'); return; }
      setUserId(session.user.id);
      setUserEmail(session.user.email || null);

      const { data } = await supabase
        .from('profiles')
        .select('display_name, company_name, phone, license_id')
        .eq('user_id', session.user.id)
        .single();

      if (data) {
        setProfile({
          display_name: data.display_name || '',
          company_name: (data as any).company_name || '',
          phone: (data as any).phone || '',
          license_id: (data as any).license_id || '',
        });
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleSaveProfile = async () => {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: profile.display_name || null,
        company_name: profile.company_name || null,
        phone: profile.phone || null,
        license_id: profile.license_id || null,
      } as any)
      .eq('user_id', userId);
    if (error) toast.error('Failed to save profile');
    else toast.success('Profile saved');
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) toast.error(error.message);
    else { toast.success('Password updated'); setNewPassword(''); setConfirmPassword(''); }
    setChangingPassword(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>
                <Shield className="h-4 w-4 mr-1" /> Admin
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container py-8 max-w-2xl space-y-6">
        <h1 className="font-display text-2xl font-bold">Settings</h1>

        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile"><User className="h-4 w-4 mr-1" /> Profile</TabsTrigger>
            <TabsTrigger value="plan"><CreditCard className="h-4 w-4 mr-1" /> My Plan</TabsTrigger>
            <TabsTrigger value="security"><KeyRound className="h-4 w-4 mr-1" /> Security</TabsTrigger>
            <TabsTrigger value="account"><LogOut className="h-4 w-4 mr-1" /> Account</TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Your personal and business information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {userEmail && (
                  <div className="space-y-2">
                    <Label>Email Address</Label>
                    <Input value={userEmail} disabled className="opacity-60" />
                    <p className="text-xs text-muted-foreground">Email cannot be changed here</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Display Name</Label>
                  <Input value={profile.display_name} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} placeholder="Your name" />
                </div>
                <div className="space-y-2">
                  <Label>Company Name</Label>
                  <Input value={profile.company_name} onChange={(e) => setProfile({ ...profile, company_name: e.target.value })} placeholder="Company or firm name" />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="(555) 555-5555" />
                </div>
                <div className="space-y-2">
                  <Label>License ID</Label>
                  <Input value={profile.license_id} onChange={(e) => setProfile({ ...profile, license_id: e.target.value })} placeholder="Professional license number" />
                </div>
                <Button onClick={handleSaveProfile} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save Changes
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="plan">
            <Card>
              <CardHeader>
                <CardTitle>My Plan</CardTitle>
                <CardDescription>Your current subscription and usage</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
                  <div>
                    <p className="font-semibold">Current Plan</p>
                    <p className="text-sm text-muted-foreground mt-0.5">No active subscription</p>
                  </div>
                  <Badge variant="outline">No Plan</Badge>
                </div>

                <div className="space-y-3">
                  {[
                    { plan: "One-Time Report", price: "$199/report", desc: "Single report with 24hr delivery" },
                    { plan: "Professional", price: "$599/mo", desc: "5 reports · priority queue · rush included" },
                  ].map((p) => (
                    <div key={p.plan} className="flex items-center justify-between p-4 rounded-lg border border-border">
                      <div>
                        <p className="font-medium text-sm">{p.plan}</p>
                        <p className="text-xs text-muted-foreground">{p.desc}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{p.price}</span>
                        <Button size="sm" variant="outline" onClick={() => navigate('/order')}>Select</Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-border pt-4">
                  <Button variant="outline" className="w-full" onClick={() => toast.info("Stripe billing portal coming soon")}>
                    <CreditCard className="h-4 w-4 mr-2" /> Manage Billing
                  </Button>
                  <p className="text-xs text-muted-foreground text-center mt-2">Powered by Stripe · SSL secured</p>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
                  <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                  <span>Enterprise plans for law firms and title companies — <span className="text-primary cursor-pointer hover:underline" onClick={() => window.location.href = "mailto:hello@bincheckyc.com"}>contact us</span></span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>Update your account password</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" />
                </div>
                <div className="space-y-2">
                  <Label>Confirm Password</Label>
                  <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" />
                </div>
                <Button onClick={handleChangePassword} disabled={changingPassword}>
                  {changingPassword ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <KeyRound className="h-4 w-4 mr-1" />} Update Password
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="account">
            <Card>
              <CardHeader>
                <CardTitle>Account</CardTitle>
                <CardDescription>Manage your account</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="destructive" onClick={handleLogout}>
                  <LogOut className="h-4 w-4 mr-1" /> Sign Out
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Settings;
