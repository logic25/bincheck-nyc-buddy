/**
 * AnalystApprovalPanel
 *
 * Shown inside DDReportViewer for users with analyst or admin roles.
 * Lets the reviewer run through a quick checklist, then either:
 *   - "Approve & Send"  → sets workflow_status = 'analyst_approved' which
 *                          triggers the send-report-email edge function.
 *   - "Send back to data fetch" → resets workflow_status = 'data_fetching'
 *                                  so the generate-dd-report function reruns.
 *
 * The panel is always visible to analysts / admins regardless of report.status.
 * It reads/writes workflow_status (from the 20260614030000 migration).
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CheckCircle2, RefreshCw, Send, ShieldCheck } from 'lucide-react';

// Inline mirror of the public.dd_report_status enum (20260614030000_workflow_status.sql).
// Kept local because the generated Supabase types file hasn't picked up the new enum yet.
type WorkflowStatus =
  | 'lead_pending'
  | 'lead_approved'
  | 'data_fetching'
  | 'data_ready'
  | 'analyst_review'
  | 'analyst_approved'
  | 'sent'
  | 'delivered';

interface AnalystApprovalPanelProps {
  reportId: string;
  address: string;
  clientEmail?: string | null;
  workflowStatus?: WorkflowStatus | string | null;
  /** Called after a successful status change so the parent can refetch. */
  onStatusChange?: (newStatus: WorkflowStatus) => void;
}

const CHECKLIST_ITEMS = [
  { id: 'violations_checked', label: 'Violations reviewed — open items flagged, closed items noted' },
  { id: 'permits_checked',    label: 'Permit applications reviewed — status and expiry confirmed' },
  { id: 'summary_edited',     label: 'Executive summary edited / confirmed accurate' },
  { id: 'score_reviewed',     label: 'Risk score and unit-relevance classifications reviewed' },
  { id: 'client_context',     label: 'Client context (scope of work, role) reflected in the notes' },
] as const;

type ChecklistKey = typeof CHECKLIST_ITEMS[number]['id'];

const WORKFLOW_LABELS: Partial<Record<WorkflowStatus, { label: string; tone: string }>> = {
  lead_pending:      { label: 'Lead pending',     tone: 'bg-amber-100 text-amber-800 border-amber-200' },
  lead_approved:     { label: 'Lead approved',    tone: 'bg-blue-100 text-blue-800 border-blue-200' },
  data_fetching:     { label: 'Data fetching',    tone: 'bg-sky-100 text-sky-800 border-sky-200' },
  data_ready:        { label: 'Data ready',       tone: 'bg-purple-100 text-purple-800 border-purple-200' },
  analyst_review:    { label: 'Analyst review',   tone: 'bg-violet-100 text-violet-800 border-violet-200' },
  analyst_approved:  { label: 'Analyst approved', tone: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  sent:              { label: 'Sent',             tone: 'bg-teal-100 text-teal-800 border-teal-200' },
  delivered:         { label: 'Delivered',        tone: 'bg-green-100 text-green-800 border-green-200' },
};

const AnalystApprovalPanel = ({
  reportId,
  address,
  clientEmail,
  workflowStatus,
  onStatusChange,
}: AnalystApprovalPanelProps) => {
  const queryClient = useQueryClient();

  const [checked, setChecked] = useState<Record<ChecklistKey, boolean>>({
    violations_checked: false,
    permits_checked:    false,
    summary_edited:     false,
    score_reviewed:     false,
    client_context:     false,
  });

  // Allow overriding the send-to address (defaults to clientEmail on the report)
  const [sendToEmail, setSendToEmail] = useState(clientEmail ?? '');

  const allChecked = CHECKLIST_ITEMS.every((item) => checked[item.id]);

  const toggle = (id: ChecklistKey) =>
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  // -------------------------------------------------------------------------
  // Mark analyst_review (claim the report for review)
  // -------------------------------------------------------------------------
  const claimMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('dd_reports')
        .update({ workflow_status: 'analyst_review' } as any)
        .eq('id', reportId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Report claimed for analyst review');
      queryClient.invalidateQueries({ queryKey: ['dd_reports'] });
      onStatusChange?.('analyst_review');
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed to claim report'),
  });

  // -------------------------------------------------------------------------
  // Approve & Send
  // -------------------------------------------------------------------------
  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!sendToEmail?.trim()) throw new Error('Recipient email is required');

      const { data: { session } } = await supabase.auth.getSession();

      // 1. Update report workflow_status + audit columns
      const { error: updateErr } = await supabase
        .from('dd_reports')
        .update({
          workflow_status: 'analyst_approved',
          approved_by: session?.user.id ?? null,
          approved_at: new Date().toISOString(),
          sent_to_email: sendToEmail.trim(),
        } as any)
        .eq('id', reportId);

      if (updateErr) throw updateErr;

      // 2. Invoke send-report-email edge function
      const { error: fnErr } = await supabase.functions.invoke('send-report-email', {
        body: {
          report_id: reportId,
          recipient_email: sendToEmail.trim(),
        },
      });

      // Non-fatal if function fails (status already set; retry from admin)
      if (fnErr) {
        console.warn('send-report-email invoke warning:', fnErr);
        toast.warning('Report approved but email dispatch encountered an error — check Resend logs', { duration: 6000 });
      }
    },
    onSuccess: () => {
      toast.success('Report approved and delivery email queued');
      queryClient.invalidateQueries({ queryKey: ['dd_reports'] });
      onStatusChange?.('analyst_approved');
    },
    onError: (e: any) => toast.error(e.message ?? 'Approval failed'),
  });

  // -------------------------------------------------------------------------
  // Send back to data fetch
  // -------------------------------------------------------------------------
  const refetchMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('dd_reports')
        .update({ workflow_status: 'data_fetching' } as any)
        .eq('id', reportId);
      if (error) throw error;

      // Kick off re-generation
      await supabase.functions.invoke('generate-dd-report', {
        body: { reportId, address, forceRegenerate: true },
      });
    },
    onSuccess: () => {
      toast.success('Sent back to data fetch — generation restarted');
      queryClient.invalidateQueries({ queryKey: ['dd_reports'] });
      onStatusChange?.('data_fetching');
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed to re-queue data fetch'),
  });

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const wfMeta = WORKFLOW_LABELS[workflowStatus as WorkflowStatus];
  const isAlreadyApproved = workflowStatus === 'analyst_approved' || workflowStatus === 'sent' || workflowStatus === 'delivered';
  const isInReview = workflowStatus === 'analyst_review';
  const isDataReady = workflowStatus === 'data_ready' || workflowStatus === 'lead_approved';

  return (
    <Card className="border-violet-200 bg-violet-50/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-violet-600" />
            Analyst Review
          </CardTitle>
          {wfMeta && (
            <Badge variant="outline" className={wfMeta.tone}>
              {wfMeta.label}
            </Badge>
          )}
        </div>
        <CardDescription>
          Complete the checklist below, then approve to send the PDF to the client.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Claim button when data is ready but not yet claimed */}
        {isDataReady && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => claimMutation.mutate()}
            disabled={claimMutation.isPending}
            className="border-violet-300 text-violet-700 hover:bg-violet-100"
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            {claimMutation.isPending ? 'Claiming…' : 'Claim for review'}
          </Button>
        )}

        {/* Checklist — visible when in review or already approved (read-only) */}
        {(isInReview || isAlreadyApproved) && (
          <div className="space-y-2.5">
            {CHECKLIST_ITEMS.map((item) => (
              <div key={item.id} className="flex items-start gap-3">
                <Checkbox
                  id={`analyst-check-${item.id}`}
                  checked={isAlreadyApproved || checked[item.id]}
                  onCheckedChange={() => !isAlreadyApproved && toggle(item.id)}
                  disabled={isAlreadyApproved}
                  className="mt-0.5"
                />
                <label
                  htmlFor={`analyst-check-${item.id}`}
                  className={`text-sm cursor-pointer ${isAlreadyApproved ? 'line-through text-muted-foreground' : ''}`}
                >
                  {item.label}
                </label>
              </div>
            ))}
          </div>
        )}

        {/* Send-to email override — only when in review */}
        {isInReview && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Deliver to (email address)
            </label>
            <Input
              type="email"
              value={sendToEmail}
              onChange={(e) => setSendToEmail(e.target.value)}
              placeholder="client@example.com"
              className="max-w-sm"
            />
            {!sendToEmail?.trim() && (
              <p className="text-xs text-red-500 mt-1">Required before approving.</p>
            )}
          </div>
        )}

        {/* Action buttons — in review state */}
        {isInReview && (
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  disabled={!allChecked || !sendToEmail?.trim() || approveMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  {approveMutation.isPending ? 'Sending…' : 'Approve & Send'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Send report to {sendToEmail}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will mark the report analyst-approved and dispatch the delivery email
                    with a PDF download link to <strong>{sendToEmail}</strong>.
                    A "we'll invoice you monthly" note will be included.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => approveMutation.mutate()}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Yes, send it
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={refetchMutation.isPending}
                  className="border-amber-300 text-amber-700 hover:bg-amber-50"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  {refetchMutation.isPending ? 'Resetting…' : 'Send back to data fetch'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Re-run data fetch for this report?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will reset the workflow status to <em>data_fetching</em> and re-invoke the
                    generate-dd-report function. Existing AI notes and edits are preserved.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => refetchMutation.mutate()}>
                    Yes, re-fetch
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* Already approved state */}
        {isAlreadyApproved && (
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Report approved and delivery email sent.
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AnalystApprovalPanel;
