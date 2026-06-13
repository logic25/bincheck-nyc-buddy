import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileCheck, Phone, Building2 } from 'lucide-react';

interface CloseoutRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  propertyAddress: string;
  taggedApplications: Array<{ application_number: string; description: string }>;
}

const CloseoutRequestDialog = ({
  open, onOpenChange, propertyAddress, taggedApplications,
}: CloseoutRequestDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-primary" />
            Need to close out open permits?
          </DialogTitle>
          <DialogDescription>
            Open BIS and DOB NOW applications can block title transfers and new filings. A licensed expediter can manage the closeout with DOB.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">{propertyAddress}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {taggedApplications.length} open application{taggedApplications.length !== 1 ? 's' : ''} flagged for potential closeout.
            </p>
          </div>

          <div className="rounded-md border border-primary/30 bg-primary/5 p-4 space-y-3">
            <p className="text-sm leading-relaxed">
              Need this resolved? We recommend <span className="font-semibold">Green Light Expediting</span>, a licensed NYC expediter we work with.
            </p>
            <a
              href="tel:7183921969"
              className="inline-flex items-center gap-2 text-primary font-semibold text-base hover:underline"
            >
              <Phone className="w-4 h-4" />
              718-392-1969
            </a>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CloseoutRequestDialog;
