import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, XCircle, Clock, Filter } from 'lucide-react';
import { format } from 'date-fns';

const ERROR_CATEGORY_LABELS: Record<string, string> = {
  too_vague: 'Too Vague',
  wrong_severity: 'Wrong Severity',
  missing_context: 'Missing Context',
  stale_treated_as_active: 'Stale as Active',
  wrong_agency_explanation: 'Wrong Agency',
  missing_note: 'Missing Note',
  factual_error: 'Factual Error',
  tone_style: 'Tone/Style',
  knowledge_gap: 'Knowledge Gap',
  other: 'Other',
};

const EditReviewTab = () => {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('pending');

  const { data: edits, isLoading } = useQuery({
    queryKey: ['admin-report-edits', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('report_edits')
        .select('*, dd_reports!inner(address)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ editId, newStatus }: { editId: string; newStatus: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('report_edits')
        .update({
          status: newStatus,
          reviewed_by: userData?.user?.id || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', editId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-report-edits'] });
      toast.success('Edit reviewed');
    },
    onError: () => toast.error('Failed to update edit'),
  });

  const pendingCount = edits?.filter(e => e.status === 'pending').length || 0;

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending Review</CardDescription>
            <CardTitle className="text-3xl">{pendingCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Edits</CardDescription>
            <CardTitle className="text-3xl">{edits?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unique Reports Edited</CardDescription>
            <CardTitle className="text-3xl">
              {new Set(edits?.map(e => e.report_id) || []).size}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filter + Queue */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Edit Queue</CardTitle>
              <CardDescription>Review analyst corrections to AI-generated notes</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !edits || edits.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {statusFilter === 'pending' ? 'No pending edits — all caught up!' : 'No edits found.'}
            </p>
          ) : (
            <div className="space-y-3">
              {edits.map((edit: any) => (
                <div key={edit.id} className="border border-border rounded-lg p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{edit.agency}</Badge>
                      <Badge variant="outline" className="text-xs">{edit.item_type}</Badge>
                      <Badge variant="secondary" className="text-xs">
                        {ERROR_CATEGORY_LABELS[edit.error_category] || edit.error_category}
                      </Badge>
                      {edit.batch_id && <Badge variant="outline" className="text-[10px] text-muted-foreground">Batch</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      {edit.status === 'pending' && (
                        <>
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => reviewMutation.mutate({ editId: edit.id, newStatus: 'approved' })}
                            disabled={reviewMutation.isPending}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => reviewMutation.mutate({ editId: edit.id, newStatus: 'rejected' })}
                            disabled={reviewMutation.isPending}
                          >
                            <XCircle className="w-3 h-3 mr-1" /> Reject
                          </Button>
                        </>
                      )}
                      <Badge
                        variant={edit.status === 'approved' ? 'default' : edit.status === 'pending' ? 'secondary' : 'outline'}
                        className={edit.status === 'approved' ? 'bg-emerald-600 text-white' : ''}
                      >
                        {edit.status === 'approved' ? '✓ Approved' : edit.status === 'pending' ? '⏳ Pending' : '✗ Rejected'}
                      </Badge>
                    </div>
                  </div>

                  {/* Address + identifier */}
                  <div className="text-sm">
                    <span className="text-muted-foreground">Report: </span>
                    <span className="font-medium">{(edit as any).dd_reports?.address || '—'}</span>
                    <span className="text-muted-foreground ml-3">Item: </span>
                    <span className="font-mono text-xs">{edit.item_identifier}</span>
                  </div>

                  {/* Diff */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-md bg-destructive/5 border border-destructive/20">
                      <p className="text-[10px] font-semibold text-destructive uppercase tracking-wider mb-1">Original (AI)</p>
                      <p className="text-sm whitespace-pre-wrap">{edit.original_note || <span className="italic text-muted-foreground">Empty</span>}</p>
                    </div>
                    <div className="p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20">
                      <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">Corrected (Human)</p>
                      <p className="text-sm whitespace-pre-wrap">{edit.edited_note}</p>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {format(new Date(edit.created_at), 'MMM d, yyyy h:mm a')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EditReviewTab;
