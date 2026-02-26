import { useState, Fragment } from 'react';
import { TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { decodeComplaintCategory } from '@/lib/complaint-category-decoder';
import InlineNoteEditor from './InlineNoteEditor';

interface EditStatus {
  status: 'pending' | 'approved' | 'rejected';
  id: string;
}

interface ExpandableComplaintRowProps {
  complaint: any;
  index: number;
  note: string;
  onNoteChange: (note: string) => void;
  readOnly?: boolean;
  reportId: string;
  editStatus?: EditStatus | null;
  onEditSaved?: (editId: string) => void;
  bulkMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
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

const ExpandableComplaintRow = ({
  complaint,
  index,
  note,
  onNoteChange,
  readOnly = false,
  reportId,
  editStatus,
  onEditSaved,
  bulkMode = false,
  isSelected = false,
  onToggleSelect,
}: ExpandableComplaintRowProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const statusLower = (complaint.status || '').toLowerCase();
  const isClosed = statusLower === 'closed' || statusLower === 'close';
  const complaintId = complaint.complaint_number || String(index);
  const hasEdit = !!editStatus;

  return (
    <Fragment>
      <TableRow
        className={`cursor-pointer hover:bg-muted/50 transition-colors ${isClosed ? 'opacity-60' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <TableCell className="w-8">
          {bulkMode ? (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect?.()}
              onClick={(e) => e.stopPropagation()}
              className="ml-1"
            />
          ) : (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}>
              {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
          )}
        </TableCell>
        <TableCell className="font-mono text-xs">{complaintId}</TableCell>
        <TableCell className="text-xs whitespace-nowrap">{formatDate(complaint.date_entered)}</TableCell>
        <TableCell className="text-xs max-w-[250px]">
          <span className="font-medium">{decodeComplaintCategory(complaint.complaint_category)}</span>
        </TableCell>
        <TableCell className="text-xs">{complaint.unit || '—'}</TableCell>
        <TableCell>
          <Badge variant={isClosed ? 'secondary' : 'destructive'} className="text-[10px]">
            {complaint.status || 'Unknown'}
          </Badge>
        </TableCell>
        <TableCell className="text-xs">{formatDate(complaint.disposition_date)}</TableCell>
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
              {complaint.description && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Description</p>
                  <p className="text-sm">{complaint.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Category Code</p>
                  <p className="font-medium font-mono">{complaint.complaint_category || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Date Entered</p>
                  <p className="font-medium">{formatDate(complaint.date_entered)}</p>
                </div>
                {complaint.disposition_date && (
                  <div>
                    <p className="text-muted-foreground">Disposition Date</p>
                    <p className="font-medium">{formatDate(complaint.disposition_date)}</p>
                  </div>
                )}
                {complaint.unit && (
                  <div>
                    <p className="text-muted-foreground">Unit</p>
                    <p className="font-medium">{complaint.unit}</p>
                  </div>
                )}
              </div>
              <InlineNoteEditor
                note={note}
                onNoteChange={onNoteChange}
                reportId={reportId}
                itemType="complaint"
                itemIdentifier={complaintId}
                agency="DOB"
                readOnly={readOnly}
                editStatus={editStatus}
                onEditSaved={onEditSaved}
              />
            </div>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
};

export default ExpandableComplaintRow;
