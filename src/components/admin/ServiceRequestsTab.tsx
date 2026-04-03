import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Search, Building2, Mail, Phone, Scale, FileCheck, AlertTriangle, Clock } from 'lucide-react';
import { format, differenceInHours } from 'date-fns';

type ServiceRequest = {
  id: string;
  type: 'architect' | 'closeout';
  property_address: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  urgency: string;
  price_quoted: number;
  status: string;
  created_at: string;
  updated_at: string;
  request_description: string | null;
  items: string[];
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  submitted: { label: 'New', className: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  contacted: { label: 'Contacted', className: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  converted: { label: 'Converted', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  closed: { label: 'Closed', className: 'bg-muted text-muted-foreground border-border' },
};

const ServiceRequestsTab = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'architect' | 'closeout'>('all');

  const { data: requests, isLoading } = useQuery({
    queryKey: ['service-requests-admin'],
    queryFn: async () => {
      const [{ data: archData, error: archErr }, { data: closeData, error: closeErr }] = await Promise.all([
        supabase.from('architect_requests' as any).select('*').order('created_at', { ascending: false }),
        supabase.from('closeout_requests' as any).select('*').order('created_at', { ascending: false }),
      ]);
      if (archErr) throw archErr;
      if (closeErr) throw closeErr;

      const architect: ServiceRequest[] = ((archData as any[]) || []).map((r) => ({
        id: r.id,
        type: 'architect' as const,
        property_address: r.property_address,
        contact_name: r.contact_name,
        contact_email: r.contact_email,
        contact_phone: r.contact_phone,
        urgency: r.urgency,
        price_quoted: r.price_quoted,
        status: r.status,
        created_at: r.created_at,
        updated_at: r.updated_at,
        request_description: r.request_description,
        items: Array.isArray(r.violation_numbers) ? r.violation_numbers : [],
      }));

      const closeout: ServiceRequest[] = ((closeData as any[]) || []).map((r) => ({
        id: r.id,
        type: 'closeout' as const,
        property_address: r.property_address,
        contact_name: r.contact_name,
        contact_email: r.contact_email,
        contact_phone: r.contact_phone,
        urgency: r.urgency,
        price_quoted: r.price_quoted,
        status: r.status,
        created_at: r.created_at,
        updated_at: r.updated_at,
        request_description: r.request_description,
        items: Array.isArray(r.application_numbers) ? r.application_numbers : [],
      }));

      return [...architect, ...closeout].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, type, status }: { id: string; type: 'architect' | 'closeout'; status: string }) => {
      const table = type === 'architect' ? 'architect_requests' : 'closeout_requests';
      const { error } = await supabase.from(table as any).update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-requests-admin'] });
      toast.success('Status updated');
    },
    onError: () => toast.error('Failed to update status'),
  });

  const filtered = (requests || [])
    .filter((r) => filter === 'all' || r.type === filter)
    .filter((r) =>
      !search ||
      r.property_address.toLowerCase().includes(search.toLowerCase()) ||
      r.contact_name.toLowerCase().includes(search.toLowerCase()) ||
      r.contact_email.toLowerCase().includes(search.toLowerCase())
    );

  const isStale = (r: ServiceRequest) =>
    r.status === 'submitted' && differenceInHours(new Date(), new Date(r.created_at)) > 48;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-primary" />
          Service Requests ({requests?.length ?? 0})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by address, name, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="architect">Architect</TabsTrigger>
              <TabsTrigger value="closeout">Closeout</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {!filtered.length ? (
          <div className="text-center py-12 text-muted-foreground">
            <Scale className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No service requests found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((req) => {
              const stale = isStale(req);
              const statusCfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.submitted;

              return (
                <div
                  key={`${req.type}-${req.id}`}
                  className={`p-4 rounded-lg border transition-colors ${
                    stale ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-card hover:bg-muted/30'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {req.type === 'architect' ? (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Scale className="h-3 w-3" /> Architect Letter
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs gap-1">
                            <FileCheck className="h-3 w-3" /> Permit Closeout
                          </Badge>
                        )}
                        {req.urgency === 'rush' && (
                          <Badge className="bg-destructive text-destructive-foreground text-xs">RUSH</Badge>
                        )}
                        <Badge variant="outline" className={statusCfg.className}>
                          {statusCfg.label}
                        </Badge>
                        {stale && (
                          <Badge variant="destructive" className="text-xs gap-1">
                            <AlertTriangle className="h-3 w-3" /> &gt;48hrs
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        {req.property_address}
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {req.contact_name} &lt;{req.contact_email}&gt;
                        </span>
                        {req.contact_phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {req.contact_phone}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {format(new Date(req.created_at), 'MMM d, yyyy h:mm a')}
                        </span>
                        <span className="font-medium text-foreground">${req.price_quoted}</span>
                      </div>

                      {req.items.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {req.type === 'architect' ? 'Violations' : 'Applications'}: {req.items.join(', ')}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0">
                      <Select
                        value={req.status}
                        onValueChange={(value) => updateStatus.mutate({ id: req.id, type: req.type, status: value })}
                      >
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="submitted">New</SelectItem>
                          <SelectItem value="contacted">Contacted</SelectItem>
                          <SelectItem value="converted">Converted</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ServiceRequestsTab;
