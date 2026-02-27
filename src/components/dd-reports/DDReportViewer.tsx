import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft, Building2, AlertTriangle, FileStack, FileWarning, Download, Trash2,
  Save, StickyNote, Calendar, User, Loader2, RefreshCw, CheckCircle2, Shield, MapPin, Hash, Pencil, Eye, MessageSquareWarning, ListChecks
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import DDReportPrintView from './DDReportPrintView';
import ExpandableViolationRow from './ExpandableViolationRow';
import ExpandableApplicationRow from './ExpandableApplicationRow';
import ExpandableComplaintRow from './ExpandableComplaintRow';
import BatchEditPanel, { type SelectedItem } from './BatchEditPanel';
import html2pdf from 'html2pdf.js';
import { getAgencyColor } from '@/lib/violation-utils';
import ReactMarkdown from 'react-markdown';
import { decodeComplaintCategory } from '@/lib/complaint-category-decoder';

const formatBBL = (bbl: string | null | undefined): string => {
  if (!bbl) return '—';
  const clean = bbl.replace(/\D/g, '');
  if (clean.length < 10) return bbl;
  const borough = clean.slice(0, 1);
  const block = clean.slice(1, 6).replace(/^0+/, '') || '0';
  const lot = clean.slice(6, 10).replace(/^0+/, '') || '0';
  return `${borough}-${block}-${lot}`;
};

const safeFormatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  try {
    if (/^\d{8}$/.test(dateStr)) {
      const year = parseInt(dateStr.slice(0, 4));
      const month = parseInt(dateStr.slice(4, 6)) - 1;
      const day = parseInt(dateStr.slice(6, 8));
      const date = new Date(year, month, day);
      if (isNaN(date.getTime())) return dateStr;
      return format(date, 'MMM d, yyyy');
    }
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return format(date, 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
};

interface UserProfile {
  email: string | null;
  display_name: string | null;
  company_name: string | null;
  phone: string | null;
  license_id: string | null;
}

interface DDReportViewerProps {
  report: {
    id: string;
    address: string;
    bin: string | null;
    bbl: string | null;
    prepared_for: string;
    prepared_by: string | null;
    report_date: string;
    status: string;
    building_data: any;
    violations_data: any;
    applications_data: any;
    orders_data: any;
    complaints_data?: any;
    line_item_notes: any[];
    general_notes: string | null;
    ai_analysis: string | null;
    created_at: string;
    customer_concern?: string | null;
    property_status_summary?: string | null;
  };
  onBack: () => void;
  onDelete: () => void;
  onRegenerate?: (reportId: string, address: string) => void;
  isRegenerating?: boolean;
  userProfile?: UserProfile;
  /** When true, hides all admin/edit controls — pure read-only client view */
  clientReadOnly?: boolean;
}

const DDReportViewer = ({ report, onBack, onDelete, onRegenerate, isRegenerating = false, userProfile, clientReadOnly = false }: DDReportViewerProps) => {
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRole();
  const printRef = useRef<HTMLDivElement>(null);
  // True when content cannot be edited: approved status OR non-admin client viewing
  const isReadOnly = report.status === 'approved' || clientReadOnly;
  const [isExporting, setIsExporting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [generalNotes, setGeneralNotes] = useState(report.general_notes || '');
  const [aiAnalysis, setAiAnalysis] = useState(report.ai_analysis || '');
  const [isEditingAI, setIsEditingAI] = useState(false);
  const [lineItemNotes, setLineItemNotes] = useState<Record<string, string>>(
    (report.line_item_notes || []).reduce((acc: Record<string, string>, item: any) => {
      acc[`${item.item_type}-${item.item_id}`] = item.note;
      return acc;
    }, {})
  );
  const [applicationFilter, setApplicationFilter] = useState<string>('all');
  const [violationFilter, setViolationFilter] = useState<string>('all');
  const [activeSection, setActiveSection] = useState<'violations' | 'applications' | 'complaints' | 'analysis' | 'notes'>('violations');

  // Track edit statuses for line items
  const [editStatuses, setEditStatuses] = useState<Record<string, { status: 'pending' | 'approved' | 'rejected'; id: string }>>({});

  // Load existing edit statuses for this report
  const { data: existingEdits } = useQuery({
    queryKey: ['report-edits', report.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('report_edits')
        .select('id, item_type, item_identifier, status')
        .eq('report_id', report.id)
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  // Sync existing edits into editStatuses state
  useEffect(() => {
    if (!existingEdits) return;
    const map: typeof editStatuses = {};
    for (const edit of existingEdits) {
      const key = `${edit.item_type}-${edit.item_identifier}`;
      // Only keep the most recent edit per item (already ordered desc)
      if (!map[key]) {
        map[key] = { status: edit.status as any, id: edit.id };
      }
    }
    setEditStatuses(map);
  }, [existingEdits]);

  const handleEditSaved = useCallback((itemType: string, itemId: string, editId: string) => {
    setEditStatuses(prev => ({
      ...prev,
      [`${itemType}-${itemId}`]: { status: 'pending', id: editId },
    }));
  }, []);

  // Bulk edit mode
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const toggleBulkMode = useCallback(() => {
    setBulkMode(prev => {
      if (prev) setSelectedItems(new Set());
      return !prev;
    });
  }, []);

  const toggleItemSelection = useCallback((key: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback((items: string[]) => {
    setSelectedItems(prev => {
      const allSelected = items.every(k => prev.has(k));
      const next = new Set(prev);
      if (allSelected) {
        items.forEach(k => next.delete(k));
      } else {
        items.forEach(k => next.add(k));
      }
      return next;
    });
  }, []);

  // Build SelectedItem data for batch panel
  const getSelectedItemData = useCallback((): SelectedItem[] => {
    return Array.from(selectedItems).map(key => {
      const [itemType, ...rest] = key.split(':');
      const itemIdentifier = rest[0] || '';
      const agency = rest[1] || 'DOB';
      return {
        itemType: itemType as SelectedItem['itemType'],
        itemIdentifier,
        agency,
        currentNote: lineItemNotes[`${itemType}-${itemIdentifier}`] || '',
      };
    });
  }, [selectedItems, lineItemNotes]);

  const handleBatchSaved = useCallback((editIds: string[]) => {
    // Mark all selected items as pending
    const newStatuses = { ...editStatuses };
    let i = 0;
    for (const key of selectedItems) {
      const [itemType, ...rest] = key.split(':');
      const itemIdentifier = rest[0] || '';
      newStatuses[`${itemType}-${itemIdentifier}`] = { status: 'pending', id: editIds[i] || '' };
      i++;
    }
    setEditStatuses(newStatuses);
    setSelectedItems(new Set());
    setBulkMode(false);
  }, [editStatuses, selectedItems]);

  const handleExportPDF = async () => {
    if (!printRef.current) return;
    setIsExporting(true);
    try {
      const element = printRef.current;
      const opt = {
        margin: 0.5,
        filename: `DD-Report-${report.address.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in' as const, format: 'letter' as const, orientation: 'portrait' as const }
      };
      await html2pdf().set(opt).from(element).save();
      toast.success('PDF exported successfully');
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to export PDF');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePreviewPDF = async () => {
    if (!printRef.current) return;
    setIsPreviewing(true);
    try {
      const element = printRef.current;
      const opt = {
        margin: 0.5,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in' as const, format: 'letter' as const, orientation: 'portrait' as const }
      };
      const pdfBlob = await html2pdf().set(opt).from(element).outputPdf('blob');
      const url = URL.createObjectURL(pdfBlob);
      setPreviewBlobUrl(url);
    } catch (error) {
      console.error('PDF preview error:', error);
      toast.error('Failed to generate preview');
      setIsPreviewing(false);
    }
  };

  const closePreview = () => {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
    setIsPreviewing(false);
  };

  const saveNotes = useMutation({
    mutationFn: async () => {
      const formattedNotes = Object.entries(lineItemNotes).map(([key, note]) => {
        const [item_type, ...rest] = key.split('-');
        const item_id = rest.join('-');
        return { item_type, item_id, note };
      }).filter(n => n.note.trim());

      const { error } = await supabase
        .from('dd_reports')
        .update({
          general_notes: generalNotes.trim() || null,
          line_item_notes: formattedNotes,
          ai_analysis: aiAnalysis.trim() || null,
        } as any)
        .eq('id', report.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dd-reports'] });
      toast.success('Notes saved');
    },
    onError: () => {
      toast.error('Failed to save notes');
    },
  });

  const approveReport = useMutation({
    mutationFn: async () => {
      const formattedNotes = Object.entries(lineItemNotes).map(([key, note]) => {
        const [item_type, ...rest] = key.split('-');
        const item_id = rest.join('-');
        return { item_type, item_id, note };
      }).filter(n => n.note.trim());

      const { error } = await supabase
        .from('dd_reports')
        .update({
          general_notes: generalNotes.trim() || null,
          line_item_notes: formattedNotes,
          status: 'approved',
        } as any)
        .eq('id', report.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dd-reports'] });
      toast.success('Report approved and finalized');
    },
    onError: () => {
      toast.error('Failed to approve report');
    },
  });

  // isReadOnly is defined above in the component initializer
  const violations = report.violations_data || [];
  const applications = report.applications_data || [];
  const orders = report.orders_data || { stop_work: [], partial_stop_work: [], vacate: [] };
  const complaints = report.complaints_data || [];
  const building = report.building_data || {};

  const bisApplications = applications.filter((a: any) => a.source === 'BIS');
  const dobNowApplications = applications.filter((a: any) => a.source === 'DOB_NOW');
  const dobViolations = violations.filter((v: any) => v.agency === 'DOB');
  const ecbViolations = violations.filter((v: any) => v.agency === 'ECB');
  const hpdViolations = violations.filter((v: any) => v.agency === 'HPD');

  // Dynamic agency list derived from actual violation data
  const violationAgencies = ['all', ...Array.from(new Set<string>(violations.map((v: any) => v.agency))).sort()];

  const hasStopWorkOrder = (orders.stop_work?.length || 0) > 0;
  const hasPartialStopWork = (orders.partial_stop_work?.length || 0) > 0;
  const hasVacateOrder = (orders.vacate?.length || 0) > 0;
  const hasCriticalOrders = hasStopWorkOrder || hasPartialStopWork || hasVacateOrder;

  const updateLineItemNote = (itemType: string, itemId: string, note: string) => {
    setLineItemNotes(prev => ({ ...prev, [`${itemType}-${itemId}`]: note }));
  };

  // Check if report is stale (generating for >5 minutes)
  const isStaleGenerating = report.status === 'generating' && (() => {
    const updatedAt = new Date(report.created_at).getTime();
    return Date.now() - updatedAt > 5 * 60 * 1000;
  })();

  const statusLabel = report.status === 'approved' ? 'Approved' : report.status === 'pending_review' ? 'Pending Review' : report.status === 'generating' ? (isStaleGenerating ? 'Stale — Retry' : 'Generating') : report.status;

  const sectionNav = [
    { key: 'violations' as const, label: 'Violations', count: violations.length, icon: AlertTriangle },
    { key: 'applications' as const, label: 'Applications', count: applications.length, icon: FileStack },
    ...(complaints.length > 0 ? [{ key: 'complaints' as const, label: 'Complaints', count: complaints.length, icon: MessageSquareWarning }] : []),
    { key: 'analysis' as const, label: 'AI Analysis', icon: Shield },
    { key: 'notes' as const, label: 'Notes', icon: StickyNote },
  ];

  return (
    <div className="space-y-0">
      {/* Compact Header Bar */}
      <div className="flex items-center justify-between pb-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-2">
          {/* Client read-only: show only PDF download */}
          {clientReadOnly ? (
            <>
              <Button variant="outline" onClick={handlePreviewPDF} disabled={isPreviewing}>
                {isPreviewing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                Preview Report
              </Button>
              <Button onClick={handleExportPDF} disabled={isExporting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                Download PDF
              </Button>
            </>
          ) : (
            <>
              {isAdmin && report.status === 'pending_review' && (
                <Button size="sm" onClick={() => approveReport.mutate()} disabled={approveReport.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {approveReport.isPending ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1.5" />}
                  Approve
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => saveNotes.mutate()} disabled={saveNotes.isPending || isReadOnly}>
                <Save className="w-3 h-3 mr-1.5" /> Save
              </Button>
              <Button variant="outline" size="sm" onClick={() => onRegenerate?.(report.id, report.address)} disabled={isRegenerating || !onRegenerate}>
                {isRegenerating ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
                Regen
              </Button>
              <Button variant="outline" size="sm" onClick={handlePreviewPDF} disabled={isPreviewing}>
                {isPreviewing ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Eye className="w-3 h-3 mr-1.5" />}
                Preview
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={isExporting}>
                {isExporting ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Download className="w-3 h-3 mr-1.5" />}
                PDF
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Report</AlertDialogTitle>
                    <AlertDialogDescription>Delete the DD report for "{report.address}"? This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>

      {/* Report Title Block */}
      <div className="border border-border rounded-xl p-6 bg-card mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-display font-bold tracking-tight">{report.address}</h1>
              <Badge
                variant={report.status === 'approved' ? 'default' : report.status === 'pending_review' ? 'secondary' : 'outline'}
                className={report.status === 'approved' ? 'bg-emerald-600 text-white' : ''}
              >
                {statusLabel}
              </Badge>
            </div>
            <div className="flex items-center gap-5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> {report.prepared_for}</span>
              <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {format(new Date(report.report_date), 'MMMM d, yyyy')}</span>
              {report.bin && <span className="flex items-center gap-1.5 font-mono text-xs"><Hash className="w-3.5 h-3.5" /> BIN {report.bin}</span>}
              {report.bbl && <span className="font-mono text-xs">BBL {formatBBL(report.bbl)}</span>}
            </div>
          </div>
        </div>

        {/* Agency Sources Badges */}
        {(() => {
          const agenciesQueried: any[] = (report as any).agencies_queried || [];
          if (agenciesQueried.length === 0) return null;
          return (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Data Sources Queried</p>
              <div className="flex flex-wrap gap-1.5">
                {agenciesQueried.filter((a: any) => a.queried).map((a: any) => (
                  <Badge
                    key={a.agency}
                    variant={a.results > 0 ? 'default' : 'outline'}
                    className={`text-[10px] px-2 py-0.5 ${
                      a.results > 0
                        ? 'bg-primary/90 text-primary-foreground'
                        : 'text-muted-foreground border-border'
                    }`}
                  >
                    {a.agency}
                    {a.results > 0 && <span className="ml-1 font-bold">{a.results}</span>}
                    {a.results === 0 && <span className="ml-1 opacity-60">✓</span>}
                  </Badge>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                {agenciesQueried.filter((a: any) => a.results > 0).length} of {agenciesQueried.filter((a: any) => a.queried).length} sources returned records
              </p>
            </div>
          );
        })()}

        {/* Customer Concern */}
        {(report as any).customer_concern && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Customer Concern</p>
            <p className="text-sm italic text-foreground/80">"{(report as any).customer_concern}"</p>
          </div>
        )}
      </div>

      {/* Property Status Summary */}
      {(report as any).property_status_summary && (
        <div className="border border-border rounded-xl p-5 bg-muted/20 mb-6">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Property Status Summary</h3>
          <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-border">
            <Badge variant="outline" className="text-[10px] px-2 py-0.5">DOB Violations: {dobViolations.length}</Badge>
            <Badge variant="outline" className="text-[10px] px-2 py-0.5">ECB: {ecbViolations.length}</Badge>
            <Badge variant="outline" className="text-[10px] px-2 py-0.5">HPD: {hpdViolations.length}</Badge>
            <Badge variant="outline" className="text-[10px] px-2 py-0.5">Applications: {applications.length}</Badge>
            {complaints.length > 0 && <Badge variant="outline" className="text-[10px] px-2 py-0.5">Complaints: {complaints.length}</Badge>}
          </div>
          <p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-line">{(report as any).property_status_summary}</p>
        </div>
      )}

      {/* Building + Compliance Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Building Info */}
        <div className="border border-border rounded-xl p-5 bg-card">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5" /> Building Information
          </h3>
          <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Year Built</p>
              <p className="font-medium">{building.year_built || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Dwelling Units</p>
              <p className="font-medium">{building.dwelling_units || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Zoning</p>
              <p className="font-medium">{building.zoning_district || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Building Area</p>
              <p className="font-medium">{building.building_area_sqft ? `${building.building_area_sqft.toLocaleString()} sqft` : '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Landmark</p>
              <p className="font-medium">{building.is_landmark ? 'Yes' : building.historic_district ? `Historic: ${building.historic_district}` : 'No'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Owner</p>
              <p className="font-medium truncate">{building.owner_name || '—'}</p>
            </div>
          </div>
        </div>

        {/* Compliance Summary */}
        <div className="border border-border rounded-xl p-5 bg-card">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <FileStack className="w-3.5 h-3.5" /> Compliance Summary
          </h3>
          <div className={`grid ${complaints.length > 0 ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
            <div className="p-3 rounded-lg bg-muted/40 border border-border">
              <p className="text-2xl font-bold tracking-tight">{violations.length}</p>
              <p className="text-xs text-muted-foreground font-medium">Open Violations</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {violationAgencies.filter(a => a !== 'all').map(agency => (
                  <Badge key={agency} variant="outline" className="text-[10px] px-1.5 py-0">
                    {agency} {violations.filter((v: any) => v.agency === agency).length}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-muted/40 border border-border">
              <p className="text-2xl font-bold tracking-tight">{applications.length}</p>
              <p className="text-xs text-muted-foreground font-medium">Applications</p>
              <div className="flex gap-1.5 mt-2">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">BIS {bisApplications.length}</Badge>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">Build {dobNowApplications.length}</Badge>
              </div>
            </div>
            {complaints.length > 0 && (
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <p className="text-2xl font-bold tracking-tight">{complaints.length}</p>
                <p className="text-xs text-muted-foreground font-medium">DOB Complaints</p>
                <div className="flex gap-1.5 mt-2">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    Open {complaints.filter((c: any) => (c.status || '').toLowerCase() !== 'closed').length}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    Closed {complaints.filter((c: any) => (c.status || '').toLowerCase() === 'closed').length}
                  </Badge>
                </div>
              </div>
            )}
            {hasCriticalOrders && (
              <div className="col-span-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <div className="flex items-center gap-2 mb-1">
                  <FileWarning className="w-4 h-4 text-destructive" />
                  <span className="text-sm font-semibold text-destructive">Critical Orders</span>
                </div>
                <div className="text-xs space-y-0.5">
                  {hasStopWorkOrder && <p className="text-destructive">⚠ {orders.stop_work?.length} Full Stop Work Order</p>}
                  {hasPartialStopWork && <p className="text-yellow-500">⚠ {orders.partial_stop_work?.length} Partial Stop Work</p>}
                  {hasVacateOrder && <p className="text-destructive">⚠ {orders.vacate?.length} Vacate Order</p>}
                </div>
              </div>
            )}
            {!hasCriticalOrders && (
              <div className="col-span-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-500">No Critical Orders</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Critical Orders Detail */}
      {hasCriticalOrders && (
        <div className="border border-destructive/40 rounded-xl p-5 bg-destructive/5 mb-6">
          <h3 className="text-sm font-semibold text-destructive mb-3 flex items-center gap-2">
            <FileWarning className="w-4 h-4" /> Active Orders
          </h3>
          <div className="space-y-2">
            {orders.stop_work?.map((order: any, idx: number) => (
              <div key={`swo-${idx}`} className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <div className="flex items-center justify-between mb-1">
                  <Badge variant="destructive" className="text-xs">Full Stop Work Order</Badge>
                  <span className="text-xs font-mono text-muted-foreground">{safeFormatDate(order.issued_date)}</span>
                </div>
                <p className="text-sm">{order.description_raw || order.violation_type || 'No description'}</p>
                {!isReadOnly && (
                  <Input placeholder="Add note..." value={lineItemNotes[`swo-${idx}`] || ''} onChange={(e) => updateLineItemNote('swo', String(idx), e.target.value)} className="mt-2 h-8 text-sm bg-background" />
                )}
              </div>
            ))}
            {orders.partial_stop_work?.map((order: any, idx: number) => (
              <div key={`pswo-${idx}`} className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <div className="flex items-center justify-between mb-1">
                  <Badge variant="secondary" className="text-xs">Partial Stop Work</Badge>
                  <span className="text-xs font-mono text-muted-foreground">{safeFormatDate(order.issued_date)}</span>
                </div>
                <p className="text-sm">{order.description_raw || order.violation_type || 'No description'}</p>
                {!isReadOnly && (
                  <Input placeholder="Add note..." value={lineItemNotes[`pswo-${idx}`] || ''} onChange={(e) => updateLineItemNote('pswo', String(idx), e.target.value)} className="mt-2 h-8 text-sm bg-background" />
                )}
              </div>
            ))}
            {orders.vacate?.map((order: any, idx: number) => (
              <div key={`vacate-${idx}`} className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <div className="flex items-center justify-between mb-1">
                  <Badge variant="destructive" className="text-xs">Vacate Order</Badge>
                  <span className="text-xs font-mono text-muted-foreground">{safeFormatDate(order.issued_date)}</span>
                </div>
                <p className="text-sm">{order.description_raw || order.violation_type || 'No description'}</p>
                {!isReadOnly && (
                  <Input placeholder="Add note..." value={lineItemNotes[`vacate-${idx}`] || ''} onChange={(e) => updateLineItemNote('vacate', String(idx), e.target.value)} className="mt-2 h-8 text-sm bg-background" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section Navigation */}
      <div className="flex items-center border-b border-border mb-6">
        {sectionNav.map(({ key, label, count, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveSection(key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeSection === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {count !== undefined && (
              <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded-full">{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Violations Section */}
      {activeSection === 'violations' && (
        <div className="border border-border rounded-xl bg-card">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-semibold">Open Violations</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {violationAgencies.filter(a => a !== 'all').map(a => `${violations.filter((v: any) => v.agency === a).length} ${a}`).join(' · ')}
                </p>
              </div>
              {!isReadOnly && violations.length > 0 && (
                <Button variant={bulkMode && activeSection === 'violations' ? 'default' : 'outline'} size="sm" className="h-7 text-xs gap-1.5" onClick={toggleBulkMode}>
                  <ListChecks className="w-3.5 h-3.5" />
                  {bulkMode && activeSection === 'violations' ? 'Exit Bulk' : 'Bulk Edit'}
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {violationAgencies.map(f => (
                <Button key={f} variant={violationFilter === f ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setViolationFilter(f)}>
                  {f === 'all' ? `All (${violations.length})` : `${f} (${violations.filter((v: any) => v.agency === f).length})`}
                </Button>
              ))}
            </div>
          </div>
          {violations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No open violations found.</div>
          ) : (
            <ScrollArea className="h-[520px]">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-8">
                      {bulkMode && (() => {
                        const visibleKeys = violations
                          .filter((v: any) => violationFilter === 'all' || v.agency === violationFilter)
                          .map((v: any, idx: number) => `violation:${v.violation_number || v.id || idx}:${v.agency || 'DOB'}`);
                        const allSelected = visibleKeys.length > 0 && visibleKeys.every((k: string) => selectedItems.has(k));
                        return (
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={() => selectAllVisible(visibleKeys)}
                            className="ml-1"
                          />
                        );
                      })()}
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Violation #</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Agency</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Type</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Severity</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Issued</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {violations
                    .filter((v: any) => violationFilter === 'all' || v.agency === violationFilter)
                    .map((v: any, idx: number) => (
                      <ExpandableViolationRow
                        key={v.id || idx}
                        violation={v}
                        index={idx}
                        note={lineItemNotes[`violation-${v.id || idx}`] || ''}
                        onNoteChange={(note) => updateLineItemNote('violation', v.id || String(idx), note)}
                        bbl={report.bbl || building.bbl}
                        readOnly={isReadOnly}
                        reportId={report.id}
                        editStatus={editStatuses[`violation-${v.violation_number || v.id || idx}`] || null}
                        onEditSaved={(editId) => handleEditSaved('violation', v.violation_number || v.id || String(idx), editId)}
                        bulkMode={bulkMode}
                        isSelected={selectedItems.has(`violation:${v.violation_number || v.id || idx}:${v.agency || 'DOB'}`)}
                        onToggleSelect={() => toggleItemSelection(`violation:${v.violation_number || v.id || idx}:${v.agency || 'DOB'}`)}
                      />
                    ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>
      )}

      {/* Applications Section */}
      {activeSection === 'applications' && (
        <div className="border border-border rounded-xl bg-card">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-semibold">Permit Applications</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{bisApplications.length} BIS · {dobNowApplications.length} DOB NOW Build</p>
              </div>
              {!isReadOnly && applications.length > 0 && (
                <Button variant={bulkMode && activeSection === 'applications' ? 'default' : 'outline'} size="sm" className="h-7 text-xs gap-1.5" onClick={toggleBulkMode}>
                  <ListChecks className="w-3.5 h-3.5" />
                  {bulkMode && activeSection === 'applications' ? 'Exit Bulk' : 'Bulk Edit'}
                </Button>
              )}
            </div>
            <div className="flex gap-1.5">
              <Button variant={applicationFilter === 'all' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setApplicationFilter('all')}>
                All ({applications.length})
              </Button>
              <Button variant={applicationFilter === 'R' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setApplicationFilter('R')}>
                Permit Entire ({applications.filter((a: any) => { const s = (a.status || '').toUpperCase(); return s === 'R' || s.includes('PERMIT ENTIRE'); }).length})
              </Button>
              <Button variant={applicationFilter === 'in_process' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setApplicationFilter('in_process')}>
                In Process ({applications.filter((a: any) => { const s = (a.status || '').toUpperCase(); return ['A','B','C','D','E','F','G','H','K','L','M'].includes(s) || s.includes('FILED') || s.includes('PLAN EXAM'); }).length})
              </Button>
            </div>
          </div>
          {applications.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No applications found.</div>
          ) : (
            <ScrollArea className="h-[520px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-8">
                      {bulkMode && (() => {
                        const visibleKeys = applications
                          .filter((app: any) => {
                            if (applicationFilter === 'all') return true;
                            const s = (app.status || '').toUpperCase();
                            if (applicationFilter === 'R') return s === 'R' || s.includes('PERMIT ENTIRE');
                            if (applicationFilter === 'in_process') return ['A','B','C','D','E','F','G','H','K','L','M'].includes(s) || s.includes('FILED') || s.includes('PLAN EXAM');
                            return true;
                          })
                          .map((app: any, idx: number) => {
                            const appKey = `${app.source || 'BIS'}-${app.id || app.application_number || idx}`;
                            return `application:${appKey}:DOB`;
                          });
                        const allSelected = visibleKeys.length > 0 && visibleKeys.every((k: string) => selectedItems.has(k));
                        return (
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={() => selectAllVisible(visibleKeys)}
                            className="ml-1"
                          />
                        );
                      })()}
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Job #</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Job Type</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Filed</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Description</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Floor/Apt</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applications
                    .filter((app: any) => {
                      if (applicationFilter === 'all') return true;
                      const s = (app.status || '').toUpperCase();
                      if (applicationFilter === 'R') return s === 'R' || s.includes('PERMIT ENTIRE');
                      if (applicationFilter === 'in_process') return ['A','B','C','D','E','F','G','H','K','L','M'].includes(s) || s.includes('FILED') || s.includes('PLAN EXAM');
                      return true;
                    })
                    .map((app: any, idx: number) => {
                      const appKey = `${app.source || 'BIS'}-${app.id || app.application_number || idx}`;
                      return (
                        <ExpandableApplicationRow
                          key={appKey}
                          application={app}
                          index={idx}
                          note={lineItemNotes[`application-${appKey}`] || ''}
                          onNoteChange={(note) => updateLineItemNote('application', appKey, note)}
                          readOnly={isReadOnly}
                          reportId={report.id}
                          editStatus={editStatuses[`application-${appKey}`] || null}
                          onEditSaved={(editId) => handleEditSaved('application', appKey, editId)}
                          bulkMode={bulkMode}
                          isSelected={selectedItems.has(`application:${appKey}:DOB`)}
                          onToggleSelect={() => toggleItemSelection(`application:${appKey}:DOB`)}
                        />
                      );
                    })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>
      )}

      {/* DOB Complaints Section */}
      {activeSection === 'complaints' && (
        <div className="border border-border rounded-xl bg-card">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-semibold">DOB Complaints</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{complaints.length} complaints on record</p>
              </div>
              {!isReadOnly && complaints.length > 0 && (
                <Button variant={bulkMode && activeSection === 'complaints' ? 'default' : 'outline'} size="sm" className="h-7 text-xs gap-1.5" onClick={toggleBulkMode}>
                  <ListChecks className="w-3.5 h-3.5" />
                  {bulkMode && activeSection === 'complaints' ? 'Exit Bulk' : 'Bulk Edit'}
                </Button>
              )}
            </div>
          </div>
          {complaints.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No DOB complaints found.</div>
          ) : (
            <ScrollArea className="h-[520px]">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-8">
                      {bulkMode && (() => {
                        const visibleKeys = complaints.map((c: any, idx: number) => `complaint:${c.complaint_number || idx}:DOB`);
                        const allSelected = visibleKeys.length > 0 && visibleKeys.every((k: string) => selectedItems.has(k));
                        return (
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={() => selectAllVisible(visibleKeys)}
                            className="ml-1"
                          />
                        );
                      })()}
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Complaint #</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Date</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Category</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Unit</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Disposition</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {complaints.map((c: any, idx: number) => {
                    const complaintId = c.complaint_number || String(idx);
                    return (
                      <ExpandableComplaintRow
                        key={complaintId}
                        complaint={c}
                        index={idx}
                        note={lineItemNotes[`complaint-${complaintId}`] || ''}
                        onNoteChange={(n) => updateLineItemNote('complaint', complaintId, n)}
                        readOnly={isReadOnly}
                        reportId={report.id}
                        editStatus={editStatuses[`complaint-${complaintId}`] || null}
                        onEditSaved={(editId) => handleEditSaved('complaint', complaintId, editId)}
                        bulkMode={bulkMode}
                        isSelected={selectedItems.has(`complaint:${complaintId}:DOB`)}
                        onToggleSelect={() => toggleItemSelection(`complaint:${complaintId}:DOB`)}
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>
      )}

      {/* AI Analysis Section */}
      {activeSection === 'analysis' && (
        <div className="border border-border rounded-xl p-6 bg-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">AI Risk Assessment</h3>
            {!isReadOnly && aiAnalysis && (
              <Button variant="outline" size="sm" onClick={() => setIsEditingAI(!isEditingAI)}>
                {isEditingAI ? <><Eye className="w-3 h-3 mr-1.5" /> Preview</> : <><Pencil className="w-3 h-3 mr-1.5" /> Edit</>}
              </Button>
            )}
          </div>
          {isEditingAI && !isReadOnly ? (
            <Textarea
              value={aiAnalysis}
              onChange={(e) => setAiAnalysis(e.target.value)}
              rows={16}
              className="resize-none font-mono text-sm"
              placeholder="Edit AI risk assessment (Markdown supported)..."
            />
          ) : aiAnalysis ? (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 className="text-lg font-bold mt-6 mb-2 text-foreground">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-base font-bold mt-4 mb-2 text-foreground">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-bold mt-3 mb-1 text-foreground">{children}</h3>,
                  p: ({ children }) => <p className="mb-3 text-foreground/90 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc ml-4 mb-3 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal ml-4 mb-3 space-y-1">{children}</ol>,
                  li: ({ children }) => <li className="text-foreground/90">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                }}
              >
                {aiAnalysis}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground text-sm">AI analysis not available for this report.</div>
          )}
        </div>
      )}

      {/* Notes Section */}
      {activeSection === 'notes' && (
        <div className="border border-border rounded-xl p-6 bg-card">
          <h3 className="text-base font-semibold mb-4">General Notes</h3>
          <Textarea
            placeholder="Enter general notes about this property or transaction..."
            value={generalNotes}
            onChange={(e) => setGeneralNotes(e.target.value)}
            rows={8}
            disabled={isReadOnly}
            className="resize-none"
          />
        </div>
      )}

      {/* Hidden print view */}
      <div className="fixed -left-[9999px] -top-[9999px]">
        <div ref={printRef}>
          <DDReportPrintView report={{
            ...report,
            general_notes: generalNotes || report.general_notes,
            ai_analysis: aiAnalysis || report.ai_analysis,
            line_item_notes: Object.entries(lineItemNotes).map(([key, note]) => {
              const [item_type, ...rest] = key.split('-');
              return { item_type, item_id: rest.join('-'), note };
            }).filter(n => n.note.trim()),
          }} userProfile={userProfile} />
        </div>
      </div>

      {/* Batch Edit Panel */}
      {bulkMode && selectedItems.size > 0 && (
        <BatchEditPanel
          selectedItems={getSelectedItemData()}
          reportId={report.id}
          onClose={() => { setBulkMode(false); setSelectedItems(new Set()); }}
          onBatchSaved={handleBatchSaved}
        />
      )}

      {/* PDF Preview Modal */}
      {(previewBlobUrl || isPreviewing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closePreview} />
          {/* Modal */}
          <div className="relative w-[90vw] h-[90vh] max-w-6xl flex flex-col bg-card rounded-xl border border-border shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/50">
              <div className="flex items-center gap-3">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <span className="font-semibold text-sm">Report Preview</span>
                <span className="text-xs text-muted-foreground">— {report.address}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={isExporting}>
                  <Download className="w-3 h-3 mr-1.5" /> Download
                </Button>
                <Button variant="ghost" size="sm" onClick={closePreview}>
                  ✕
                </Button>
              </div>
            </div>
            {/* Content */}
            <div className="flex-1 bg-muted/30">
              {previewBlobUrl ? (
                <iframe
                  src={previewBlobUrl}
                  className="w-full h-full border-0"
                  title="PDF Preview"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Generating preview…</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DDReportViewer;
