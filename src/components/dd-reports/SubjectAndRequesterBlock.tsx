/**
 * Shared Subject + Requester intake block.
 *
 * Used by both the customer-facing Order.tsx flow and the admin-side
 * CreateDDReportDialog.tsx so every report row in `dd_reports` has the
 * same four framing fields:
 *
 *   - subject_type:        'unit' | 'building'
 *   - subject_unit:        string (required client-side when type = 'unit')
 *   - scope_of_work:       free text (e.g. "future combination 10A+10B")
 *   - requested_by_role:   Attorney | Title Company | Broker | Investor | Owner | Other
 *
 * These flow through `generate-dd-report` into the per-item AI prompt and
 * the conclusion. They never gate features — only frame language.
 */

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Home } from 'lucide-react';

export type SubjectType = 'unit' | 'building';
export type RequestedByRole = 'Attorney' | 'Title Company' | 'Broker' | 'Investor' | 'Owner' | 'Other';

export const REQUESTED_BY_ROLES: RequestedByRole[] = [
  'Attorney',
  'Title Company',
  'Broker',
  'Investor',
  'Owner',
  'Other',
];

export interface SubjectAndRequesterValue {
  subject_type: SubjectType;
  subject_unit: string;
  scope_of_work: string;
  requested_by_role: RequestedByRole | '';
}

export const emptySubjectValue = (): SubjectAndRequesterValue => ({
  subject_type: 'building',
  subject_unit: '',
  scope_of_work: '',
  requested_by_role: '',
});

interface SubjectAndRequesterBlockProps {
  value: SubjectAndRequesterValue;
  onChange: (next: SubjectAndRequesterValue) => void;
  disabled?: boolean;
  /** Render compact (intake form) vs. spacious (admin dialog). Default 'compact'. */
  variant?: 'compact' | 'spacious';
}

export const SubjectAndRequesterBlock = ({
  value,
  onChange,
  disabled = false,
  variant = 'compact',
}: SubjectAndRequesterBlockProps) => {
  const update = (patch: Partial<SubjectAndRequesterValue>) => onChange({ ...value, ...patch });

  const gap = variant === 'spacious' ? 'space-y-4' : 'space-y-3';

  return (
    <div className={gap}>
      {/* Subject type ------------------------------------------------------ */}
      <div className="space-y-2">
        <Label>
          Report Scope <span className="text-destructive">*</span>
        </Label>
        <RadioGroup
          value={value.subject_type}
          onValueChange={(v) => update({ subject_type: v as SubjectType, subject_unit: v === 'building' ? '' : value.subject_unit })}
          disabled={disabled}
          className="grid grid-cols-2 gap-2"
        >
          <label
            htmlFor="subject-building"
            className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
              value.subject_type === 'building' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
            }`}
          >
            <RadioGroupItem value="building" id="subject-building" className="mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Building2 className="h-3.5 w-3.5" /> Whole Building
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Title, refi, or full-property due diligence.
              </p>
            </div>
          </label>
          <label
            htmlFor="subject-unit"
            className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
              value.subject_type === 'unit' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
            }`}
          >
            <RadioGroupItem value="unit" id="subject-unit" className="mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Home className="h-3.5 w-3.5" /> Specific Unit
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Purchase, transfer, or combination of one apartment.
              </p>
            </div>
          </label>
        </RadioGroup>
      </div>

      {/* Conditional unit input ------------------------------------------- */}
      {value.subject_type === 'unit' && (
        <div className="space-y-2">
          <Label htmlFor="subject-unit-id">
            Unit Identifier <span className="text-destructive">*</span>
          </Label>
          <Input
            id="subject-unit-id"
            placeholder="e.g. 10B, PH3, 4-East"
            value={value.subject_unit}
            onChange={(e) => update({ subject_unit: e.target.value })}
            disabled={disabled}
            maxLength={32}
          />
          <p className="text-xs text-muted-foreground">
            Each item will be evaluated for impact on this unit specifically.
          </p>
        </div>
      )}

      {/* Scope of work ---------------------------------------------------- */}
      <div className="space-y-2">
        <Label htmlFor="scope-of-work">
          Transaction Context <span className="text-muted-foreground">(Optional)</span>
        </Label>
        <Textarea
          id="scope-of-work"
          placeholder={
            value.subject_type === 'unit'
              ? 'e.g. Purchase closing in 6 weeks; want assurance no open items affect Unit 10B or block a future combination with 10A.'
              : 'e.g. Refi underwriting — lender needs confirmation no SWO, vacate, or unresolved tax liens of record.'
          }
          value={value.scope_of_work}
          onChange={(e) => update({ scope_of_work: e.target.value })}
          disabled={disabled}
          rows={3}
          className="resize-none text-sm"
          maxLength={1000}
        />
        <p className="text-xs text-muted-foreground">
          Helps tailor the per-item notes and conclusion to your transaction.
        </p>
      </div>

      {/* Requester role --------------------------------------------------- */}
      <div className="space-y-2">
        <Label htmlFor="requested-by-role">
          Requested By <span className="text-muted-foreground">(Optional)</span>
        </Label>
        <Select
          value={value.requested_by_role || undefined}
          onValueChange={(v) => update({ requested_by_role: v as RequestedByRole })}
          disabled={disabled}
        >
          <SelectTrigger id="requested-by-role">
            <SelectValue placeholder="Select your role" />
          </SelectTrigger>
          <SelectContent>
            {REQUESTED_BY_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Lightly tunes the language for your audience. Never gates content.
        </p>
      </div>
    </div>
  );
};

/**
 * Validation helper — true when the block has the minimum required fields
 * filled. Callers use this to enable/disable continue buttons.
 */
export const isSubjectBlockValid = (v: SubjectAndRequesterValue): boolean => {
  if (v.subject_type === 'unit' && !v.subject_unit.trim()) return false;
  return true;
};
