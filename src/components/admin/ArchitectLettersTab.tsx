import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Scale, Search, Building2, Mail, Phone, FileText } from 'lucide-react';
import { format } from 'date-fns';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  submitted: { label: 'Submitted', color: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  assigned: { label: 'Assigned', color: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  site_visit_scheduled: { label: 'Site Visit', color: 'bg-purple-500/10 text-purple-600 border-purple-500/30' },
  draft_ready: { label: 'Draft Ready', color: 'bg-teal-500/10 text-teal-600 border-teal-500/30' },
  delivered: { label: 'Delivered', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
};

const ArchitectLettersTab = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editArchitect, setEditArchitect] = useState('');
  const [editStatus, setEditStatus] = useState('');

  const { data: requests, isLoading } = useQuery({
    queryKey: ['architect-requests-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('architect_requests' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const updateRequest = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase
        .from('architect_requests' as any)
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['architect-requests-admin'] });
      toast.success('Request updated');
      setEditingId(null);
    },
    onError: () => toast.error('Failed to update request'),
  });

  const filtered = (requests || []).filter((r: any) =>
    !search ||
    r.property_address?.toLowerCase().includes(search.toLowerCase()) ||
    r.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.contact_email?.toLowerCase().includes(search.toLowerCase())
  );

  const statusCounts = (requests || []).reduce((acc: Record<string, number>, r: any) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Pipeline Stats */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <Badge key={key} variant="outline" className={`${cfg.color} text-xs px-2.5 py-1`}>
            {cfg.label}: {statusCounts[key] || 0}
          </Badge>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-primary" />
            Architect Letter Requests ({filtered.length})
          </CardTitle>
          <CardDescription>Manage architect opinion letter requests from customers</CardDescription>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by address, name, or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No architect letter requests yet.</p>
          ) : (
            <div className="space-y-3">
              {filtered.map((req: any) => {
                const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.submitted;
                const isEditing = editingId === req.id;
                const violations = Array.isArray(req.violation_numbers) ? req.violation_numbers : [];

                return (
                  <div key={req.id} className="p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`${cfg.color} text-xs`}>{cfg.label}</Badge>
                          {req.urgency === 'rush' && <Badge variant="destructive" className="text-xs">RUSH</Badge>}
                          <span className="font-semibold text-sm">{req.property_address}</span>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {req.contact_name}</span>
                          <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {req.contact_email}</span>
                          {req.contact_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {req.contact_phone}</span>}
                          <span>${Number(req.price_quoted).toLocaleString()}</span>
                          <span>{format(new Date(req.created_at), 'MMM d, yyyy')}</span>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {violations.map((vn: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px] font-mono px-1.5">{vn}</Badge>
                          ))}
                        </div>

                        {req.request_description && (
                          <p className="text-xs text-muted-foreground italic">"{req.request_description}"</p>
                        )}

                        {req.assigned_architect && (
                          <p className="text-xs"><span className="text-muted-foreground">Architect:</span> <span className="font-medium">{req.assigned_architect}</span></p>
                        )}
                      </div>

                      <div className="shrink-0">
                        {isEditing ? (
                          <div className="space-y-2 w-48">
                            <Input
                              placeholder="Architect name"
                              value={editArchitect}
                              onChange={(e) => setEditArchitect(e.target.value)}
                              className="h-8 text-xs"
                            />
                            <Select value={editStatus} onValueChange={setEditStatus}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                className="h-7 text-xs flex-1"
                                onClick={() => updateRequest.mutate({
                                  id: req.id,
                                  updates: {
                                    ...(editArchitect ? { assigned_architect: editArchitect } : {}),
                                    status: editStatus,
                                  },
                                })}
                                disabled={updateRequest.isPending}
                              >
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              setEditingId(req.id);
                              setEditArchitect(req.assigned_architect || '');
                              setEditStatus(req.status);
                            }}
                          >
                            Update
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ArchitectLettersTab;
