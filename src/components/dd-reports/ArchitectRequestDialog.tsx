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
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Scale, Building2 } from 'lucide-react';

interface ArchitectRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  propertyAddress: string;
  taggedViolations: Array<{ violation_number: string; description: string }>;
}

const ArchitectRequestDialog = ({
  open, onOpenChange, reportId, propertyAddress, taggedViolations,
}: ArchitectRequestDialogProps) => {
  const queryClient = useQueryClient();
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<'standard' | 'rush'>('standard');
  const [selectedViolations, setSelectedViolations] = useState<string[]>(
    taggedViolations.map(v => v.violation_number)
  );

  const price = urgency === 'rush' ? 1250 : 750;

  const toggleViolation = (vn: string) => {
    setSelectedViolations(prev =>
      prev.includes(vn) ? prev.filter(v => v !== vn) : [...prev, vn]
    );
  };

  const submitRequest = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) throw new Error('Not authenticated');

      const { error } = await supabase.from('architect_requests' as any).insert({
        report_id: reportId,
        user_id: session.session.user.id,
        property_address: propertyAddress,
        violation_numbers: selectedViolations,
        request_description: description.trim() || null,
        contact_name: contactName.trim(),
        contact_email: contactEmail.trim(),
        contact_phone: contactPhone.trim() || null,
        urgency,
        price_quoted: price,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['architect-requests'] });
      toast.success('Architect opinion letter request submitted');
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error('Failed to submit request: ' + (err instanceof Error ? err.message : 'Unknown error'));
    },
  });

  const isValid = contactName.trim() && contactEmail.trim() && selectedViolations.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-primary" />
            Request Architect Opinion Letter
          </DialogTitle>
          <DialogDescription>
            BinCheckNYC will coordinate with our architect network to prepare a professional opinion letter for DOB submission.
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

          {/* Violations */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
              Violations to Address ({selectedViolations.length} selected)
            </Label>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {taggedViolations.map(v => (
                <label
                  key={v.violation_number}
                  className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                    selectedViolations.includes(v.violation_number)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedViolations.includes(v.violation_number)}
                    onChange={() => toggleViolation(v.violation_number)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <span className="font-mono text-xs">{v.violation_number}</span>
                    <p className="text-xs text-muted-foreground truncate">{v.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="arch-desc">Brief Description of Request</Label>
            <Textarea
              id="arch-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Any specific details about the violations or the desired outcome..."
              rows={3}
              className="mt-1"
            />
          </div>

          {/* Contact Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="arch-name">Contact Name *</Label>
              <Input id="arch-name" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Full name" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="arch-email">Email *</Label>
              <Input id="arch-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="email@example.com" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="arch-phone">Phone</Label>
              <Input id="arch-phone" type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="(212) 555-0100" className="mt-1" />
            </div>
          </div>

          {/* Urgency */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Turnaround Time</Label>
            <RadioGroup value={urgency} onValueChange={(v) => setUrgency(v as 'standard' | 'rush')} className="grid grid-cols-2 gap-3">
              <label className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-colors ${urgency === 'standard' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <RadioGroupItem value="standard" className="sr-only" />
                <span className="text-sm font-semibold">Standard</span>
                <span className="text-xs text-muted-foreground">5–7 business days</span>
                <span className="text-lg font-bold mt-1">$750</span>
              </label>
              <label className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-colors ${urgency === 'rush' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <RadioGroupItem value="rush" className="sr-only" />
                <span className="text-sm font-semibold">Rush</span>
                <span className="text-xs text-muted-foreground">2–3 business days</span>
                <span className="text-lg font-bold mt-1">$1,250</span>
              </label>
            </RadioGroup>
            <p className="text-[10px] text-muted-foreground mt-2 italic">
              Pricing is indicative — actual fees depend on architect network rates and complexity.
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
            Submit Request — ${price.toLocaleString()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ArchitectRequestDialog;
