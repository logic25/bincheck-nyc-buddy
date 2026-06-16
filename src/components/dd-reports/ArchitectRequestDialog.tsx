import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Scale, Phone, Building2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [urgency, setUrgency] = useState<'standard' | 'rush'>('standard');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (!contactEmail && user.email) setContactEmail(user.email);
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('user_id', user.id)
        .maybeSingle();
      if (profile) {
        if (!contactName && (profile as any).full_name) setContactName((profile as any).full_name);
        if (!contactPhone && (profile as any).phone) setContactPhone((profile as any).phone);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactEmail.trim()) {
      toast.error('Name and email are required.');
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be signed in to submit a request.');

      const vioNumbers = taggedViolations.map(v => v.violation_number).filter(Boolean);

      const { data: inserted, error: insertErr } = await supabase
        .from('architect_requests' as any)
        .insert({
          report_id: reportId,
          user_id: user.id,
          property_address: propertyAddress,
          violation_numbers: vioNumbers,
          request_description: notes.trim() || null,
          contact_name: contactName.trim(),
          contact_email: contactEmail.trim(),
          contact_phone: contactPhone.trim() || null,
          urgency,
          price_quoted: 0,
          status: 'submitted',
        } as any)
        .select()
        .single();

      if (insertErr) throw insertErr;

      const items = taggedViolations.map(v =>
        `${v.violation_number}${v.description ? ` — ${v.description}` : ''}`
      );
      await Promise.allSettled([
        supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'client-request-confirmation',
            recipientEmail: contactEmail.trim(),
            idempotencyKey: `architect-confirm-${(inserted as any).id}`,
            templateData: {
              clientName: contactName.trim(),
              requestType: 'architect opinion letter',
              propertyAddress,
            },
          },
        }),
        supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'gle-lead-notification',
            idempotencyKey: `architect-gle-${(inserted as any).id}`,
            templateData: {
              requestType: 'Architect Opinion Letter',
              propertyAddress,
              clientName: contactName.trim(),
              clientEmail: contactEmail.trim(),
              clientPhone: contactPhone.trim() || undefined,
              items,
              urgency,
              priceQuoted: 0,
              requestDescription: notes.trim() || undefined,
            },
          },
        }),
      ]);

      toast.success('Request submitted. You will receive a quote within 1 business day.');
      onOpenChange(false);
      setNotes('');
    } catch (err: any) {
      console.error('Architect request error:', err);
      toast.error(err.message || 'Could not submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-primary" />
            Request architect opinion letter
          </DialogTitle>
          <DialogDescription>
            Green Light Expediting will reply within 1 business day with a fixed-fee quote for a registered architect to draft an opinion letter for DOB submission.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">{propertyAddress}</span>
            </div>
            {taggedViolations.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground mb-1">
                  {taggedViolations.length} violation{taggedViolations.length !== 1 ? 's' : ''} included:
                </p>
                <ul className="text-xs space-y-0.5 max-h-24 overflow-y-auto">
                  {taggedViolations.map((v, i) => (
                    <li key={i} className="truncate">• {v.violation_number} — {v.description}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No specific violations tagged — describe the scope in the notes.
              </p>
            )}
          </div>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="arch-name">Your name *</Label>
              <Input
                id="arch-name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="arch-email">Email *</Label>
                <Input
                  id="arch-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="arch-phone">Phone</Label>
                <Input
                  id="arch-phone"
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Timeline</Label>
              <RadioGroup
                value={urgency}
                onValueChange={(v) => setUrgency(v as 'standard' | 'rush')}
                className="flex gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="standard" id="arch-std" />
                  <Label htmlFor="arch-std" className="font-normal cursor-pointer">Standard</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="rush" id="arch-rush" />
                  <Label htmlFor="arch-rush" className="font-normal cursor-pointer">Rush</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="arch-notes">Notes (optional)</Label>
              <Textarea
                id="arch-notes"
                placeholder="Anything GLE should know about the scope, deadlines, or context."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Prefer to call?{' '}
            <a href="tel:7183921969" className="inline-flex items-center gap-1 text-primary hover:underline">
              <Phone className="w-3 h-3" />718-392-1969
            </a>
          </p>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Submit request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ArchitectRequestDialog;
