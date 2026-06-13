import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Mail, Search, RefreshCw, Phone, Building2, MapPin, Tag, ExternalLink, Filter } from 'lucide-react';
import AdminNav from '@/components/admin/AdminNav';
import type { Database } from '@/integrations/supabase/types';

type MarketingLead = Database['public']['Tables']['marketing_leads']['Row'];
type OrderLead = Database['public']['Tables']['order_leads']['Row'];

/**
 * Sales triage dashboard.
 *
 * Two distinct lead sources show up in tabs:
 *   1. marketing_leads — captured from lead-capture dialog (sample / pricing /
 *      enterprise / general intent). Has a status workflow.
 *   2. order_leads     — captured mid-order-flow when someone abandons before
 *      payment. Simpler: converted true/false.
 *
 * Both use server-side filtering by status, with email/property text search
 * applied client-side (lists are small enough — under 1000 rows expected for
 * months).
 *
 * Access: admin + sales only. RLS already enforces this server-side; the
 * client guard here is for UX (avoid showing a blank page to a confused user).
 */

// ---------------------------------------------------------------------------
// Status visualization
// ---------------------------------------------------------------------------
const MARKETING_STATUS_TONE: Record<string, string> = {
  new:        'bg-blue-100 text-blue-800 border-blue-200',
  contacted:  'bg-amber-100 text-amber-800 border-amber-200',
  qualified:  'bg-purple-100 text-purple-800 border-purple-200',
  converted:  'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected:   'bg-gray-100 text-gray-700 border-gray-200',
  spam:       'bg-rose-100 text-rose-800 border-rose-200',
};

const INTENT_TONE: Record<string, string> = {
  sample:     'bg-sky-100 text-sky-800 border-sky-200',
  pricing:    'bg-violet-100 text-violet-800 border-violet-200',
  enterprise: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  general:    'bg-slate-100 text-slate-700 border-slate-200',
};

const ALL_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'rejected', 'spam'] as const;

const AdminLeads = () => {
  const navigate = useNavigate();
  const role = useUserRole();
  const queryClient = useQueryClient();

  const canAccess = !role.isLoading && (role.isAdmin || role.isSales);

  // Marketing lead filters
  const [marketingStatus, setMarketingStatus] = useState<string>('all');
  const [marketingIntent, setMarketingIntent] = useState<string>('all');
  const [marketingSearch, setMarketingSearch] = useState<string>('');

  // Order lead filters
  const [orderConverted, setOrderConverted] = useState<string>('all');
  const [orderSearch, setOrderSearch] = useState<string>('');

  // Active lead in the side panel
  const [openMarketing, setOpenMarketing] = useState<MarketingLead | null>(null);

  // Redirect non-staff away — admins + sales only.
  useEffect(() => {
    if (!role.isLoading && !canAccess) {
      navigate('/dashboard', { replace: true });
    }
  }, [role.isLoading, canAccess, navigate]);

  // -------------------------------------------------------------------------
  // Marketing leads query
  // -------------------------------------------------------------------------
  const marketingQuery = useQuery({
    queryKey: ['marketing_leads', marketingStatus, marketingIntent],
    enabled: !!canAccess,
    queryFn: async () => {
      let q = supabase
        .from('marketing_leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (marketingStatus !== 'all') q = q.eq('status', marketingStatus);
      if (marketingIntent !== 'all') q = q.eq('intent', marketingIntent);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as MarketingLead[];
    },
  });

  const filteredMarketing = useMemo(() => {
    const rows = marketingQuery.data ?? [];
    if (!marketingSearch.trim()) return rows;
    const s = marketingSearch.toLowerCase();
    return rows.filter((r) =>
      r.email?.toLowerCase().includes(s) ||
      r.name?.toLowerCase().includes(s) ||
      r.company?.toLowerCase().includes(s) ||
      r.property_address?.toLowerCase().includes(s),
    );
  }, [marketingQuery.data, marketingSearch]);

  // -------------------------------------------------------------------------
  // Order leads query
  // -------------------------------------------------------------------------
  const orderQuery = useQuery({
    queryKey: ['order_leads', orderConverted],
    enabled: !!canAccess,
    queryFn: async () => {
      let q = supabase
        .from('order_leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (orderConverted === 'yes') q = q.eq('converted', true);
      if (orderConverted === 'no') q = q.eq('converted', false);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as OrderLead[];
    },
  });

  const filteredOrders = useMemo(() => {
    const rows = orderQuery.data ?? [];
    if (!orderSearch.trim()) return rows;
    const s = orderSearch.toLowerCase();
    return rows.filter((r) =>
      r.email?.toLowerCase().includes(s) ||
      r.first_name?.toLowerCase().includes(s) ||
      r.last_name?.toLowerCase().includes(s) ||
      r.company?.toLowerCase().includes(s) ||
      r.address?.toLowerCase().includes(s),
    );
  }, [orderQuery.data, orderSearch]);

  // -------------------------------------------------------------------------
  // Status / note mutation
  // -------------------------------------------------------------------------
  const updateLead = useMutation({
    mutationFn: async (vars: { id: string; status?: string; notes?: string }) => {
      const patch: Record<string, unknown> = {};
      if (vars.status) {
        patch.status = vars.status;
        if (vars.status === 'contacted') patch.contacted_at = new Date().toISOString();
        if (vars.status === 'converted') patch.converted_at = new Date().toISOString();
      }
      if (typeof vars.notes === 'string') patch.notes = vars.notes;
      const { error } = await supabase.from('marketing_leads').update(patch).eq('id', vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Lead updated');
      queryClient.invalidateQueries({ queryKey: ['marketing_leads'] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Update failed'),
  });

  // Derived counts — declared before early returns to satisfy rules of hooks.
  const marketingCounts = useMemo(() => {
    const rows = marketingQuery.data ?? [];
    const out: Record<string, number> = { all: rows.length };
    for (const s of ALL_STATUSES) out[s] = rows.filter((r) => r.status === s).length;
    return out;
  }, [marketingQuery.data]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (role.isLoading) {
    return <div className="p-8"><Skeleton className="h-32 w-full" /></div>;
  }
  if (!canAccess) return null;

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight">Leads</h1>
            <p className="text-muted-foreground mt-1">Sales triage for marketing leads and abandoned orders.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { marketingQuery.refetch(); orderQuery.refetch(); }}
            disabled={marketingQuery.isFetching || orderQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${marketingQuery.isFetching || orderQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <Tabs defaultValue="marketing">
          <TabsList>
            <TabsTrigger value="marketing">
              Marketing leads
              <Badge variant="secondary" className="ml-2">{marketingCounts.all ?? 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="orders">
              Abandoned orders
              <Badge variant="secondary" className="ml-2">{(orderQuery.data ?? []).length}</Badge>
            </TabsTrigger>
          </TabsList>

          {/* =================================================================
              MARKETING LEADS TAB
              ================================================================= */}
          <TabsContent value="marketing" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter className="h-4 w-4" /> Filters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Status</label>
                    <Select value={marketingStatus} onValueChange={setMarketingStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        {ALL_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Intent</label>
                    <Select value={marketingIntent} onValueChange={setMarketingIntent}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All intents</SelectItem>
                        <SelectItem value="sample">sample</SelectItem>
                        <SelectItem value="pricing">pricing</SelectItem>
                        <SelectItem value="enterprise">enterprise</SelectItem>
                        <SelectItem value="general">general</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Search</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="email, name, firm, or address…"
                        className="pl-9"
                        value={marketingSearch}
                        onChange={(e) => setMarketingSearch(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {filteredMarketing.length} {filteredMarketing.length === 1 ? 'lead' : 'leads'}
                </CardTitle>
                <CardDescription>Click any row to update status or add notes.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {marketingQuery.isLoading ? (
                  <div className="p-6 space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : filteredMarketing.length === 0 ? (
                  <div className="p-12 text-center text-sm text-muted-foreground">
                    No leads match your filters.
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredMarketing.map((lead) => (
                      <button
                        key={lead.id}
                        onClick={() => setOpenMarketing(lead)}
                        className="w-full text-left p-4 hover:bg-muted/40 transition-colors flex flex-col sm:flex-row sm:items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{lead.email}</span>
                            <Badge variant="outline" className={MARKETING_STATUS_TONE[lead.status ?? 'new']}>
                              {lead.status}
                            </Badge>
                            {lead.intent && (
                              <Badge variant="outline" className={INTENT_TONE[lead.intent] ?? ''}>
                                <Tag className="h-3 w-3 mr-1" />{lead.intent}
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                            {lead.name && <span>{lead.name}</span>}
                            {lead.company && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{lead.company}</span>}
                            {lead.property_address && <span className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3" />{lead.property_address}</span>}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {lead.created_at ? formatDistanceToNow(new Date(lead.created_at), { addSuffix: true }) : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* =================================================================
              ORDER LEADS TAB
              ================================================================= */}
          <TabsContent value="orders" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter className="h-4 w-4" /> Filters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Converted?</label>
                    <Select value={orderConverted} onValueChange={setOrderConverted}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="no">Abandoned</SelectItem>
                        <SelectItem value="yes">Converted to order</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Search</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="email, name, firm, address…"
                        className="pl-9"
                        value={orderSearch}
                        onChange={(e) => setOrderSearch(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {filteredOrders.length} {filteredOrders.length === 1 ? 'lead' : 'leads'}
                </CardTitle>
                <CardDescription>People who started the order form but didn't finish.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {orderQuery.isLoading ? (
                  <div className="p-6 space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="p-12 text-center text-sm text-muted-foreground">
                    No abandoned orders match your filters.
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredOrders.map((lead) => (
                      <div key={lead.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{lead.email}</span>
                            {lead.converted ? (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200" variant="outline">converted</Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-200" variant="outline">abandoned · step {lead.step_reached ?? '?'}</Badge>
                            )}
                            {lead.rush_requested && <Badge variant="outline" className="bg-rose-100 text-rose-800 border-rose-200">rush</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                            {(lead.first_name || lead.last_name) && <span>{[lead.first_name, lead.last_name].filter(Boolean).join(' ')}</span>}
                            {lead.company && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{lead.company}</span>}
                            {lead.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>}
                            {lead.address && <span className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3" />{lead.address}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={`mailto:${lead.email}?subject=BinCheckNYC%20-%20Following%20up%20on%20your%20order`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <Mail className="h-3 w-3" /> Email
                          </a>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {lead.created_at ? formatDistanceToNow(new Date(lead.created_at), { addSuffix: true }) : ''}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ===================================================================
          MARKETING LEAD DETAIL DIALOG
          =================================================================== */}
      <MarketingLeadDialog
        lead={openMarketing}
        onClose={() => setOpenMarketing(null)}
        onUpdate={(patch) => {
          if (!openMarketing) return;
          updateLead.mutate({ id: openMarketing.id, ...patch });
        }}
        isUpdating={updateLead.isPending}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Lead detail dialog. Local notes state so typing doesn't refire the mutation
// on every keystroke — we save explicitly on Save click.
// ---------------------------------------------------------------------------
interface MarketingLeadDialogProps {
  lead: MarketingLead | null;
  onClose: () => void;
  onUpdate: (patch: { status?: string; notes?: string }) => void;
  isUpdating: boolean;
}

const MarketingLeadDialog = ({ lead, onClose, onUpdate, isUpdating }: MarketingLeadDialogProps) => {
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<string>('new');

  useEffect(() => {
    if (lead) {
      setNotes(lead.notes ?? '');
      setStatus(lead.status ?? 'new');
    }
  }, [lead]);

  if (!lead) return null;

  return (
    <Dialog open={!!lead} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            {lead.email}
          </DialogTitle>
          <DialogDescription>
            Captured {lead.created_at ? format(new Date(lead.created_at), 'PPpp') : ''}
            {lead.intent && <> · intent: <span className="font-medium">{lead.intent}</span></>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Identity */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Name" value={lead.name} />
            <Field label="Firm" value={lead.company} />
            <Field label="Role" value={lead.role} />
            <Field label="Property" value={lead.property_address} />
          </div>

          {/* Attribution */}
          {(lead.utm_source || lead.utm_medium || lead.utm_campaign || lead.referrer) && (
            <div className="text-xs text-muted-foreground space-y-1 border-l-2 border-muted pl-3">
              {lead.utm_source && <div>utm_source: {lead.utm_source}</div>}
              {lead.utm_medium && <div>utm_medium: {lead.utm_medium}</div>}
              {lead.utm_campaign && <div>utm_campaign: {lead.utm_campaign}</div>}
              {lead.referrer && <div className="truncate">referrer: {lead.referrer}</div>}
            </div>
          )}

          {/* Their message */}
          {lead.message && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Their message</label>
              <div className="mt-1 p-3 bg-muted/40 rounded text-sm whitespace-pre-wrap">{lead.message}</div>
            </div>
          )}

          {/* Status */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Internal notes</label>
            <Textarea
              rows={4}
              placeholder="What you learned on the follow-up call, next steps, why this is qualified or not…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Conversion link */}
          {lead.converted_to_report_id && (
            <a
              href={`/dd-reports?report=${lead.converted_to_report_id}`}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" /> View converted report
            </a>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <a
            href={`mailto:${lead.email}?subject=BinCheckNYC%20-%20Following%20up`}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm border rounded-md hover:bg-muted"
          >
            <Mail className="h-3 w-3" /> Email
          </a>
          <Button
            onClick={() => {
              onUpdate({
                status: status !== lead.status ? status : undefined,
                notes: notes !== (lead.notes ?? '') ? notes : undefined,
              });
            }}
            disabled={isUpdating || (status === (lead.status ?? 'new') && notes === (lead.notes ?? ''))}
          >
            {isUpdating ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Field = ({ label, value }: { label: string; value?: string | null }) => (
  <div>
    <div className="text-xs font-medium text-muted-foreground">{label}</div>
    <div className="text-sm">{value || <span className="text-muted-foreground/60">—</span>}</div>
  </div>
);

export default AdminLeads;
