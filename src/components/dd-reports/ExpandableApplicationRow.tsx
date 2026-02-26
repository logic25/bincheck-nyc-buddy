import { useState, Fragment } from 'react';
import { TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import InlineNoteEditor from './InlineNoteEditor';

interface EditStatus {
  status: 'pending' | 'approved' | 'rejected';
  id: string;
}

interface ExpandableApplicationRowProps {
  application: any;
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

const ExpandableApplicationRow = ({ application, index, note, onNoteChange, readOnly = false, reportId, editStatus, onEditSaved, bulkMode = false, isSelected = false, onToggleSelect }: ExpandableApplicationRowProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const getStatusColor = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s.includes('sign-off') || s.includes('signoff') || s === 'x') return 'bg-green-500/10 text-green-400 border-green-500/20';
    if (s.includes('permit entire') || s.includes('permit issued')) return 'bg-green-500/10 text-green-400 border-green-500/20';
    if (s.includes('permit partial')) return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    if (s.includes('approv') && !s.includes('disapprov')) return 'bg-green-500/10 text-green-400 border-green-500/20';
    if (s.includes('disapprov') || s.includes('denied') || s.includes('withdraw')) return 'bg-red-500/10 text-red-400 border-red-500/20';
    if (s.includes('file') || s.includes('plan') || s.includes('review') || s === 'p' || s === 'q') return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
    return '';
  };

  const cleanValue = (val: string | null | undefined): string | null => {
    if (!val) return null;
    const trimmed = val.trim();
    if (trimmed.length <= 2 && !/^\d+$/.test(trimmed)) return null;
    if (['N/A', 'NA', '-', '--', 'ER', 'NONE'].includes(trimmed.toUpperCase())) return null;
    return trimmed;
  };

  const cleanFloor = cleanValue(application.floor);
  const cleanApt = cleanValue(application.apartment);
  const floorApt = [cleanFloor, cleanApt].filter(Boolean).join(' / ') || '—';

  const appKey = `${application.source || 'BIS'}-${application.id || application.application_number || index}`;
  const hasEdit = !!editStatus;

  return (
    <Fragment>
      <TableRow
        className="cursor-pointer hover:bg-muted/50 transition-colors"
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
        <TableCell className="font-mono text-sm">{application.application_number || application.job_number}</TableCell>
        <TableCell>
          <Badge variant="outline">{application.application_type || application.job_type || '—'}</Badge>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className={getStatusColor(application.status)}>
            {application.status || '—'}
          </Badge>
        </TableCell>
        <TableCell>{formatDate(application.filing_date)}</TableCell>
        <TableCell className="max-w-[200px] truncate" title={application.job_description || ''}>
          {application.job_description?.slice(0, 40) || '—'}
          {application.job_description?.length > 40 ? '...' : ''}
        </TableCell>
        <TableCell>{floorApt}</TableCell>
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
              {application.job_description && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Job Description</p>
                  <p className="text-sm">{application.job_description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Source</p>
                  <p className="font-medium">{application.source === 'DOB_NOW' ? 'DOB NOW Build' : 'DOB BIS'}</p>
                </div>
                {application.work_type && (
                  <div>
                    <p className="text-muted-foreground">Work Type</p>
                    <p className="font-medium">{application.work_type}</p>
                  </div>
                )}
                {application.latest_action_date && (
                  <div>
                    <p className="text-muted-foreground">Last Action</p>
                    <p className="font-medium">{formatDate(application.latest_action_date)}</p>
                  </div>
                )}
              </div>

              {application.source === 'DOB_NOW' && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm border-t border-border pt-4">
                  {application.permit_status && (
                    <div>
                      <p className="text-muted-foreground">Permit Status</p>
                      <p className="font-medium">{application.permit_status}</p>
                    </div>
                  )}
                  {application.approved_date && (
                    <div>
                      <p className="text-muted-foreground">Approved Date</p>
                      <p className="font-medium">{formatDate(application.approved_date)}</p>
                    </div>
                  )}
                  {application.issued_date && (
                    <div>
                      <p className="text-muted-foreground">Issued Date</p>
                      <p className="font-medium">{formatDate(application.issued_date)}</p>
                    </div>
                  )}
                  {application.filing_reason && (
                    <div>
                      <p className="text-muted-foreground">Filing Reason</p>
                      <p className="font-medium">{application.filing_reason}</p>
                    </div>
                  )}
                </div>
              )}

              {application.source !== 'DOB_NOW' && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm border-t border-border pt-4">
                  {application.approval_date && (
                    <div>
                      <p className="text-muted-foreground">Approval Date</p>
                      <p className="font-medium">{formatDate(application.approval_date)}</p>
                    </div>
                  )}
                  {application.expiration_date && (
                    <div>
                      <p className="text-muted-foreground">Permit Expiration</p>
                      <p className="font-medium">{formatDate(application.expiration_date)}</p>
                    </div>
                  )}
                  {application.signoff_date && (
                    <div>
                      <p className="text-muted-foreground">Sign-Off Date</p>
                      <p className="font-medium">{formatDate(application.signoff_date)}</p>
                    </div>
                  )}
                  {application.owner_name && (
                    <div>
                      <p className="text-muted-foreground">Owner</p>
                      <p className="font-medium">{application.owner_name}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="text-sm border-t border-border pt-4">
                <p className="text-sm font-medium text-muted-foreground mb-2">Filing Professional (Architect/PE)</p>
                {application.source === 'DOB_NOW' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(application.applicant_first_name || application.applicant_last_name) && (
                      <p className="font-medium">
                        {[application.applicant_first_name, application.applicant_last_name].filter(Boolean).join(' ')}
                      </p>
                    )}
                    {application.applicant_business_name && (
                      <p className="text-muted-foreground">{application.applicant_business_name}</p>
                    )}
                    {!application.applicant_first_name && !application.applicant_last_name && !application.applicant_business_name && (
                      <p className="text-muted-foreground">—</p>
                    )}
                  </div>
                ) : (
                  <p className="font-medium">{application.filing_professional_name || application.applicant_name || '—'}</p>
                )}
              </div>

              <InlineNoteEditor
                note={note}
                onNoteChange={onNoteChange}
                reportId={reportId}
                itemType="application"
                itemIdentifier={appKey}
                agency={application.source === 'DOB_NOW' ? 'DOB' : 'DOB'}
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
                    const jobNumber = application.application_number || application.job_number;
                    const url = application.source === 'DOB_NOW'
                      ? 'https://a810-bisweb.nyc.gov/bisweb/bispi00.jsp'
                      : `https://a810-bisweb.nyc.gov/bisweb/JobsQueryByNumberServlet?passjobnumber=${jobNumber}`;
                    window.open(url, '_blank');
                  }}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  {application.source === 'DOB_NOW' ? 'Search on DOB NOW Build' : 'View on DOB BIS'}
                </Button>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
};

export default ExpandableApplicationRow;
