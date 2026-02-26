import { useState, Fragment } from 'react';
import { TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { getAgencyLookupUrl, getAgencyColor } from '@/lib/violation-utils';
import InlineNoteEditor from './InlineNoteEditor';

interface EditStatus {
  status: 'pending' | 'approved' | 'rejected';
  id: string;
}

interface ExpandableViolationRowProps {
  violation: any;
  index: number;
  note: string;
  onNoteChange: (note: string) => void;
  bbl?: string | null;
  readOnly?: boolean;
  reportId: string;
  editStatus?: EditStatus | null;
  onEditSaved?: (editId: string) => void;
}

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  try {
    if (/^\d{8}$/.test(dateStr)) {
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      return `${month}/${day}/${year.slice(-2)}`;
    }
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear().toString().slice(-2)}`;
  } catch {
    return dateStr;
  }
};

const ExpandableViolationRow = ({ violation, index, note, onNoteChange, bbl, readOnly = false, reportId, editStatus, onEditSaved }: ExpandableViolationRowProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const getSeverityVariant = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
      case 'immediately hazardous':
      case 'class c':
      case 'v-dob':
        return 'destructive';
      case 'major':
      case 'hazardous':
      case 'class b':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  // Determine the note column badge for the collapsed row
  const hasNote = !!note;
  const hasEdit = !!editStatus;

  return (
    <Fragment>
      <TableRow
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <TableCell className="w-8">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}>
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
        </TableCell>
        <TableCell className="font-mono text-sm">{violation.violation_number}</TableCell>
        <TableCell>
          <Badge variant="outline" className={getAgencyColor(violation.agency)}>
            {violation.agency}
          </Badge>
        </TableCell>
        <TableCell className="max-w-[200px] truncate">
          {violation.violation_type || violation.description_raw?.slice(0, 50) || '—'}
        </TableCell>
        <TableCell>
          <Badge variant={getSeverityVariant(violation.severity || violation.violation_class)}>
            {violation.severity || violation.violation_class || 'Unknown'}
          </Badge>
        </TableCell>
        <TableCell>{formatDate(violation.issued_date)}</TableCell>
        <TableCell>
          <Badge variant={violation.status === 'open' ? 'destructive' : 'default'}>
            {violation.status}
          </Badge>
        </TableCell>
        <TableCell className="max-w-[200px] text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="truncate" title={note || ''}>{note || <span className="italic opacity-50">—</span>}</span>
            {hasEdit && (
              <Badge variant="outline" className={
                editStatus!.status === 'approved' ? 'text-[9px] px-1 py-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/30 shrink-0' :
                editStatus!.status === 'pending' ? 'text-[9px] px-1 py-0 bg-amber-500/10 text-amber-600 border-amber-500/30 shrink-0' :
                'text-[9px] px-1 py-0 shrink-0'
              }>
                {editStatus!.status === 'approved' ? '✓' : editStatus!.status === 'pending' ? '⏳' : '✗'}
              </Badge>
            )}
          </div>
        </TableCell>
      </TableRow>
      {isOpen && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={8} className="p-4">
            <div className="space-y-4">
              {violation.description_raw && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Description</p>
                  <p className="text-sm">{violation.description_raw}</p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                {violation.hearing_date && (
                  <div>
                    <p className="text-muted-foreground">Hearing Date</p>
                    <p className="font-medium">{formatDate(violation.hearing_date)}</p>
                  </div>
                )}
                {violation.penalty_amount && (
                  <div>
                    <p className="text-muted-foreground">Penalty Amount</p>
                    <p className="font-medium">${Number(violation.penalty_amount).toLocaleString()}</p>
                  </div>
                )}
                {violation.disposition && (
                  <div>
                    <p className="text-muted-foreground">Disposition</p>
                    <p className="font-medium">{violation.disposition}</p>
                  </div>
                )}
                {violation.apartment && (
                  <div>
                    <p className="text-muted-foreground">Apartment</p>
                    <p className="font-medium">{violation.apartment}</p>
                  </div>
                )}
                {violation.story && (
                  <div>
                    <p className="text-muted-foreground">Floor</p>
                    <p className="font-medium">{violation.story}</p>
                  </div>
                )}
              </div>
              <InlineNoteEditor
                note={note}
                onNoteChange={onNoteChange}
                reportId={reportId}
                itemType="violation"
                itemIdentifier={violation.violation_number || violation.id || String(index)}
                agency={violation.agency || 'DOB'}
                readOnly={readOnly}
                editStatus={editStatus}
                onEditSaved={onEditSaved}
              />
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(getAgencyLookupUrl(violation.agency, violation.violation_number, bbl), '_blank');
                  }}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View on {violation.agency} Portal
                </Button>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
};

export default ExpandableViolationRow;
