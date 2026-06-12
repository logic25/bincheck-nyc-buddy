import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ScrollText, Search, RefreshCw, Eye, ShieldAlert } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import AdminNav from '@/components/admin/AdminNav';

type AuditRow = Database['public']['Tables']['audit_log']['Row'];

/**
 * Color-code by action prefix so high-risk events pop visually.
 * Add new prefixes here as we instrument more code paths.
 */
const ACTION_TONE: Record<string, string> = {
  role:    'bg-purple-100 text-purple-800 border-purple-200',
  report:  'bg-blue-100 text-blue-800 border-blue-200',
  doc:     'bg-emerald-100 text-emerald-800 border-emerald-200',
  payment: 'bg-amber-100 text-amber-800 border-amber-200',
  auth:    'bg-rose-100 text-rose-800 border-rose-200',
};

const PAGE_SIZE = 100;

const AdminAudit = () => {
  const navigate = useNavigate();
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [actorFilter, setActorFilter] = useState<string>('');
  const [targetFilter, setTargetFilter] = useState<string>('');
  const [openRow, setOpenRow] = useState<AuditRow | null>(null);

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      navigate('/dashboard', { replace: true });
    }
  }, [roleLoading, isAdmin, navigate]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['audit_log', actionFilter, actorFilter, targetFilter],
    enabled: !!isAdmin,
    queryFn: async () => {
      let query = supabase
        .from('audit_log')
        .select('*')
        .order('occurred_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (actionFilter !== 'all') {
        // Prefix match: "role" → "role.assigned", "role.removed", etc.
        query = query.like('action', `${actionFilter}.%`);
      }
      if (actorFilter.trim()) {
        query = query.ilike('actor_email', `%${actorFilter.trim()}%`);
      }
      if (targetFilter.trim()) {
        query = query.ilike('target_id', `%${targetFilter.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AuditRow[];
    },
  });

  // Build the action-prefix dropdown from observed data so we never
  // hard-code something the DB doesn't have.
  const observedPrefixes = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    data.forEach((r) => {
      const prefix = r.action.split('.')[0];
      if (prefix) set.add(prefix);
    });
    return Array.from(set).sort();
  }, [data]);

  if (roleLoading) {
    return (
      <div className="container mx-auto py-10 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <>
      <AdminNav />
      <div className="container mx-auto py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <ScrollText className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
            <p className="text-sm text-muted-foreground">
              Append-only history of privileged actions. Last {PAGE_SIZE} entries.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>
            Action prefix is the bit before the dot (e.g. <code>role</code>, <code>report</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Action</label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {observedPrefixes.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Actor email</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="e.g. manny@..."
                value={actorFilter}
                onChange={(e) => setActorFilter(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Target ID</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="UUID or BIN/BBL"
                value={targetFilter}
                onChange={(e) => setTargetFilter(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !data || data.length === 0 ? (
            <div className="p-12 text-center">
              <ShieldAlert className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No audit entries match these filters yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">When</th>
                    <th className="text-left px-4 py-2 font-medium">Actor</th>
                    <th className="text-left px-4 py-2 font-medium">Action</th>
                    <th className="text-left px-4 py-2 font-medium">Target</th>
                    <th className="text-right px-4 py-2 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => {
                    const prefix = row.action.split('.')[0];
                    const tone = ACTION_TONE[prefix] ?? 'bg-slate-100 text-slate-700 border-slate-200';
                    return (
                      <tr key={row.id} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-2 align-top">
                          <div className="font-medium">{formatDistanceToNow(new Date(row.occurred_at), { addSuffix: true })}</div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(row.occurred_at), 'MMM d, HH:mm:ss')}
                          </div>
                        </td>
                        <td className="px-4 py-2 align-top">
                          <div className="font-mono text-xs">{row.actor_email ?? '—'}</div>
                          {row.actor_id && (
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {row.actor_id.slice(0, 8)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 align-top">
                          <Badge variant="outline" className={tone}>{row.action}</Badge>
                        </td>
                        <td className="px-4 py-2 align-top">
                          <div className="text-xs">{row.target_type ?? '—'}</div>
                          {row.target_id && (
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {row.target_id.length > 24 ? `${row.target_id.slice(0, 20)}…` : row.target_id}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 align-top text-right">
                          <Button size="sm" variant="ghost" onClick={() => setOpenRow(row)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      </div>
      <Dialog open={!!openRow} onOpenChange={(o) => !o && setOpenRow(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audit entry #{openRow?.id}</DialogTitle>
            <DialogDescription>
              {openRow ? format(new Date(openRow.occurred_at), 'PPpp') : ''}
            </DialogDescription>
          </DialogHeader>
          {openRow && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Action" value={openRow.action} />
                <Field label="Actor" value={openRow.actor_email ?? '—'} />
                <Field label="Target type" value={openRow.target_type ?? '—'} />
                <Field label="Target id" value={openRow.target_id ?? '—'} mono />
                <Field label="IP" value={openRow.ip_address ?? '—'} mono />
                <Field label="User-Agent" value={openRow.user_agent ?? '—'} mono />
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Metadata</div>
                <pre className="bg-muted/40 rounded p-3 text-xs overflow-x-auto max-h-72">
{JSON.stringify(openRow.metadata, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

const Field = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div>
    <div className="text-xs font-medium text-muted-foreground">{label}</div>
    <div className={mono ? 'font-mono text-xs break-all' : 'text-sm'}>{value}</div>
  </div>
);

export default AdminAudit;
