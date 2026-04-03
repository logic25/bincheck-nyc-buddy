import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, FileCheck, Building2 } from 'lucide-react';

interface CloseoutRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  propertyAddress: string;
  taggedApplications: Array<{ application_number: string; description: string }>;
}

const CloseoutRequestDialog = ({
  open, onOpenChange, reportId, propertyAddress, taggedApplications,
}: CloseoutRequestDialogProps) => {
  const queryClient = useQueryClient();
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<'standard' | 'rush'>('standard');
  const [selectedApplications, setSelectedApplications] = useState<string[]>(
    taggedApplications.map(a => a.application_number)
  );

  const price = urgency === 'rush' ? 950 : 500;

  const toggleApplication = (appNum: string) => {
    setSelectedApplications(prev =>
      prev.includes(appNum) ? prev.filter(a => a !== appNum) : [...prev, appNum]
    );
  };

  const submitRequest = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) throw new Error('Not authenticated');

      const { error } = await supabase.from('closeout_requests' as any).insert({
        report_id: reportId,
        user_id: session.session.user.id,
        property_address: propertyAddress,
        application_numbers: selectedApplications,
        request_description: description.trim() || null,
        contact_name: contactName.trim(),
        contact_email: contactEmail.trim(),
        contact_phone: contactPhone.trim() || null,
        urgency,
        price_quoted: price,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['closeout-requests'] });
      toast.success('Permit closeout request submitted');
      onOpenChange(false);

      // Send notifications (fire-and-forget)
      const idBase = `close-${reportId}-${Date.now()}`;
      supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'gle-lead-notification',
          idempotencyKey: `${idBase}-gle`,
          templateData: {
            requestType: 'Permit Closeout',
            propertyAddress,
            clientName: contactName.trim(),
            clientEmail: contactEmail.trim(),
            clientPhone: contactPhone.trim() || undefined,
            items: selectedApplications,
            urgency,
            priceQuoted: price,
            requestDescription: description.trim() || undefined,
          },
        },
      }).catch(console.error);

      supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'client-request-confirmation',
          recipientEmail: contactEmail.trim(),
          idempotencyKey: `${idBase}-confirm`,
          templateData: {
            clientName: contactName.trim(),
            requestType: 'Permit Closeout',
            propertyAddress,
          },
        },
      }).catch(console.error);
    },
    onError: (err) => {
      toast.error('Failed to submit request: ' + (err instanceof Error ? err.message : 'Unknown error'));
    },
  });

  const isValid = contactName.trim() && contactEmail.trim() && selectedApplications.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-primary" />
            Request Permit Closeout
          </DialogTitle>
          <DialogDescription>
            Green Light Expediting can help close out open permits and applications with DOB on your behalf.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Property */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Property</Label>
            <div className="flex items-center gap-2 mt-1">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">{propertyAddress}</span>
            </div>
          </div>

          {/* Applications */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
              Applications to Close Out ({selectedApplications.length} selected)
            </Label>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {taggedApplications.map(a => (
                <label
                  key={a.application_number}
                  className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                    selectedApplications.includes(a.application_number)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedApplications.includes(a.application_number)}
                    onChange={() => toggleApplication(a.application_number)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <span className="font-mono text-xs">{a.application_number}</span>
                    <p className="text-xs text-muted-foreground truncate">{a.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="closeout-desc">Additional Details</Label>
            <Textarea
              id="closeout-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Any specific details about the closeout — e.g. final inspections needed, sign-off requirements..."
              rows={3}
              className="mt-1"
            />
          </div>

          {/* Contact Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="co-name">Contact Name *</Label>
              <Input id="co-name" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Full name" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="co-email">Email *</Label>
              <Input id="co-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="email@example.com" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="co-phone">Phone</Label>
              <Input id="co-phone" type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="(212) 555-0100" className="mt-1" />
            </div>
          </div>

          {/* Urgency */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Turnaround Time</Label>
            <RadioGroup value={urgency} onValueChange={(v) => setUrgency(v as 'standard' | 'rush')} className="grid grid-cols-2 gap-3">
              <label className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-colors ${urgency === 'standard' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <RadioGroupItem value="standard" className="sr-only" />
                <span className="text-sm font-semibold">Standard</span>
                <span className="text-xs text-muted-foreground">10–15 business days</span>
                <span className="text-lg font-bold mt-1">$500</span>
              </label>
              <label className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-colors ${urgency === 'rush' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <RadioGroupItem value="rush" className="sr-only" />
                <span className="text-sm font-semibold">Rush</span>
                <span className="text-xs text-muted-foreground">5–7 business days</span>
                <span className="text-lg font-bold mt-1">$950</span>
              </label>
            </RadioGroup>
            <p className="text-[10px] text-muted-foreground mt-2 italic">
              Pricing is per application. Actual fees may vary based on complexity and DOB requirements.
            </p>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => submitRequest.mutate()}
            disabled={!isValid || submitRequest.isPending}
          >
            {submitRequest.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Submit Request — ${(price * selectedApplications.length).toLocaleString()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CloseoutRequestDialog;
