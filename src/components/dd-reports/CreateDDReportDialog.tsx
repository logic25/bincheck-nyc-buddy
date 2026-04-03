import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Building2, User, FileText } from 'lucide-react';

interface CreateDDReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (report: any) => void;
}

const CreateDDReportDialog = ({ open, onOpenChange, onSuccess }: CreateDDReportDialogProps) => {
  const queryClient = useQueryClient();

  const [address, setAddress] = useState('');
  const [preparedFor, setPreparedFor] = useState('');
  const [preparedBy, setPreparedBy] = useState('');
  const [customerConcern, setCustomerConcern] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [defaultPreparedBy, setDefaultPreparedBy] = useState('');

  // Auto-fill "Prepared By" with the current user's display name
  useEffect(() => {
    if (!open) return;
    const prefill = async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', session.session.user.id)
        .single();
      const name = profile?.display_name || session.session.user.email?.split('@')[0] || '';
      setDefaultPreparedBy(name);
      if (!preparedBy) setPreparedBy(name);
    };
    prefill();
  }, [open]);

  const createReport = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) throw new Error('Not authenticated');

      const today = new Date();
      const reportDate = today.toISOString().split('T')[0];

      const { data: report, error: insertError } = await supabase
        .from('dd_reports')
        .insert({
          user_id: session.session.user.id,
          address: address.trim(),
          prepared_for: preparedFor.trim(),
          prepared_by: preparedBy.trim() || null,
          status: 'generating',
          report_date: reportDate,
        } as any)
        .select()
        .single();

      if (insertError) throw insertError;

      const { data: genData, error: genError } = await supabase.functions.invoke('generate-dd-report', {
        body: { reportId: (report as any).id, address: address.trim(), customerConcern: customerConcern.trim() || null }
      });

      if (genError) {
        // Try to extract the actual error message from the response
        let errorMessage = genError.message;
        try {
          if (genData && typeof genData === 'object' && genData.error) {
            errorMessage = genData.error;
          }
        } catch {}
        console.error('Edge function error details:', genData, genError);
        await supabase
          .from('dd_reports')
          .update({ status: 'error' } as any)
          .eq('id', (report as any).id);
        throw new Error(errorMessage || 'Failed to generate report');
      }

      const { data: updatedReport, error: fetchError } = await supabase
        .from('dd_reports')
        .select('*')
        .eq('id', (report as any).id)
        .single();

      if (fetchError) throw fetchError;
      return updatedReport;
    },
    onSuccess: (report) => {
      queryClient.invalidateQueries({ queryKey: ['dd-reports'] });
      toast.success('Report generated successfully');
      setAddress('');
      setPreparedFor('');
      setPreparedBy('');
      setCustomerConcern('');
      onSuccess(report);
    },
    onError: (error: any) => {
      console.error('Error creating report:', error);
      toast.error(error.message || 'Failed to generate report');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim() || !preparedFor.trim()) {
      toast.error('Please enter an address and recipient name.');
      return;
    }
    createReport.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Generate DD Report
          </DialogTitle>
          <DialogDescription>
            Enter a NYC property address to generate a transaction-ready due diligence report with violations, orders, and AI risk analysis.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Property Address *
            </Label>
            <Input
              id="address"
              placeholder="e.g., 123 Main Street, Brooklyn, NY"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={createReport.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Enter a complete NYC address including borough
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="preparedFor" className="flex items-center gap-2">
              <User className="w-4 h-4" />
              Prepared For *
            </Label>
            <Input
              id="preparedFor"
              placeholder="e.g., Smith & Associates LLP"
              value={preparedFor}
              onChange={(e) => setPreparedFor(e.target.value)}
              disabled={createReport.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="preparedBy">Prepared By (Optional)</Label>
            <Input
              id="preparedBy"
              placeholder="Your name or company"
              value={preparedBy}
              onChange={(e) => setPreparedBy(e.target.value)}
              disabled={createReport.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customerConcern">What should we look for? (Optional)</Label>
            <Textarea
              id="customerConcern"
              placeholder="Flag anything that could delay closing — open permits, illegal work, or pending violations that need resolution before transfer."
              value={customerConcern}
              onChange={(e) => setCustomerConcern(e.target.value)}
              disabled={createReport.isPending}
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Describe the customer's specific concern so the AI can tailor notes for each violation and application
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createReport.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={createReport.isPending}>
              {createReport.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 mr-2" />
                  Generate Report
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateDDReportDialog;
