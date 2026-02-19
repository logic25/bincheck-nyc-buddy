import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft, Building2, AlertTriangle, FileStack, FileWarning, Download, Trash2,
  Save, StickyNote, Calendar, User, Loader2, ChevronDown, ChevronRight, RefreshCw, CheckCircle2
} from 'lucide-react';
import { format } from 'date-fns';
import DDReportPrintView from './DDReportPrintView';
import ExpandableViolationRow from './ExpandableViolationRow';
import ExpandableApplicationRow from './ExpandableApplicationRow';
import html2pdf from 'html2pdf.js';
import { getAgencyColor } from '@/lib/violation-utils';

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
    line_item_notes: any[];
    general_notes: string | null;
    ai_analysis: string | null;
    created_at: string;
  };
  onBack: () => void;
  onDelete: () => void;
  onRegenerate?: (reportId: string, address: string) => void;
  isRegenerating?: boolean;
  userProfile?: UserProfile;
}

const DDReportViewer = ({ report, onBack, onDelete, onRegenerate, isRegenerating = false, userProfile }: DDReportViewerProps) => {
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRole();
  const printRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [generalNotes, setGeneralNotes] = useState(report.general_notes || '');
  const [lineItemNotes, setLineItemNotes] = useState<Record<string, string>>(
    (report.line_item_notes || []).reduce((acc: Record<string, string>, item: any) => {
      acc[`${item.item_type}-${item.item_id}`] = item.note;
      return acc;
    }, {})
  );
  const [violationsOpen, setViolationsOpen] = useState(true);
  const [applicationsOpen, setApplicationsOpen] = useState(true);
  const [applicationFilter, setApplicationFilter] = useState<string>('all');
  const [violationFilter, setViolationFilter] = useState<string>('all');
  const [criticalOrdersOpen, setCriticalOrdersOpen] = useState(false);

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

  const saveNotes = useMutation({
    mutationFn: async () => {
      const formattedNotes = Object.entries(lineItemNotes).map(([key, note]) => {
        const [item_type, item_id] = key.split('-');
        return { item_type, item_id, note };
      }).filter(n => n.note.trim());

      const { error } = await supabase
        .from('dd_reports')
        .update({
          general_notes: generalNotes.trim() || null,
          line_item_notes: formattedNotes,
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
      // Save notes first, then approve
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

  const isReadOnly = report.status === 'approved';
  const violations = report.violations_data || [];
  const applications = report.applications_data || [];
  const orders = report.orders_data || { stop_work: [], partial_stop_work: [], vacate: [] };
  const building = report.building_data || {};

  const bisApplications = applications.filter((a: any) => a.source === 'BIS');
  const dobNowApplications = applications.filter((a: any) => a.source === 'DOB_NOW');
  const dobViolations = violations.filter((v: any) => v.agency === 'DOB');
  const ecbViolations = violations.filter((v: any) => v.agency === 'ECB');
  const hpdViolations = violations.filter((v: any) => v.agency === 'HPD');

  const hasStopWorkOrder = (orders.stop_work?.length || 0) > 0;
  const hasPartialStopWork = (orders.partial_stop_work?.length || 0) > 0;
  const hasVacateOrder = (orders.vacate?.length || 0) > 0;
  const hasCriticalOrders = hasStopWorkOrder || hasPartialStopWork || hasVacateOrder;

  const updateLineItemNote = (itemType: string, itemId: string, note: string) => {
    setLineItemNotes(prev => ({ ...prev, [`${itemType}-${itemId}`]: note }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold">{report.address}</h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
              <span className="flex items-center gap-1"><User className="w-4 h-4" /> {report.prepared_for}</span>
              <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {format(new Date(report.report_date), 'MMMM d, yyyy')}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && report.status === 'pending_review' && (
            <Button size="sm" onClick={() => approveReport.mutate()} disabled={approveReport.isPending} className="bg-green-600 hover:bg-green-700 text-white">
              {approveReport.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Approve & Finalize
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => saveNotes.mutate()} disabled={saveNotes.isPending || isReadOnly}>
            <Save className="w-4 h-4 mr-2" /> Save Notes
          </Button>
          <Button variant="outline" size="sm" onClick={() => onRegenerate?.(report.id, report.address)} disabled={isRegenerating || !onRegenerate}>
            {isRegenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            {isRegenerating ? 'Regenerating...' : 'Regenerate'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={isExporting}>
            {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Export PDF
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="icon" className="h-8 w-8">
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
        </div>
      </div>

      {/* Building Summary */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="w-5 h-5 text-primary" /> Building Information
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">BIN</p>
              <p className="font-mono text-sm font-medium">{report.bin || building.bin || '—'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">BBL</p>
              <p className="font-mono text-sm font-medium">{formatBBL(report.bbl || building.bbl)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Year Built</p>
              <p className="text-sm font-medium">{building.year_built || '—'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dwelling Units</p>
              <p className="text-sm font-medium">{building.dwelling_units || '—'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Zoning</p>
              <p className="text-sm font-medium">{building.zoning_district || '—'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Landmark</p>
              <p className="text-sm font-medium">{building.is_landmark ? 'Yes' : building.historic_district ? `Historic: ${building.historic_district}` : 'No'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Owner</p>
              <p className="text-sm font-medium truncate">{building.owner_name || '—'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Building Area</p>
              <p className="text-sm font-medium">{building.building_area_sqft ? `${building.building_area_sqft.toLocaleString()} sqft` : '—'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compliance Summary */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileStack className="w-5 h-5 text-primary" /> Compliance Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl bg-muted/50 border border-border">
              <p className="text-3xl font-bold tracking-tight">{violations.length}</p>
              <p className="text-sm font-medium text-muted-foreground mt-1">Open Violations</p>
              <div className="text-xs text-muted-foreground mt-2 space-x-2">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-500/30 text-orange-400">DOB {dobViolations.length}</Badge>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/30 text-blue-400">ECB {ecbViolations.length}</Badge>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-500/30 text-purple-400">HPD {hpdViolations.length}</Badge>
              </div>
            </div>
            <div className="p-5 rounded-xl bg-muted/50 border border-border">
              <p className="text-3xl font-bold tracking-tight">{applications.length}</p>
              <p className="text-sm font-medium text-muted-foreground mt-1">Active Applications</p>
              <div className="text-xs text-muted-foreground mt-2 space-x-2">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">BIS {bisApplications.length}</Badge>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">Build {dobNowApplications.length}</Badge>
              </div>
            </div>
            <div
              className={`p-4 rounded-xl border col-span-2 cursor-pointer transition-colors ${
                hasCriticalOrders
                  ? 'bg-destructive/10 border-destructive/30 hover:bg-destructive/20'
                  : 'bg-muted/50 border-border hover:bg-muted/70'
              }`}
              onClick={() => { if (hasCriticalOrders) { setCriticalOrdersOpen(true); setTimeout(() => { document.getElementById('critical-orders-section')?.scrollIntoView({ behavior: 'smooth' }); }, 100); } }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-2xl font-bold ${hasCriticalOrders ? 'text-destructive' : ''}`}>
                    {(orders.stop_work?.length || 0) + (orders.partial_stop_work?.length || 0) + (orders.vacate?.length || 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">Critical Items</p>
                </div>
                <div className="text-right text-sm">
                  {hasStopWorkOrder && <div className="text-destructive">⚠ {orders.stop_work?.length} Full SWO</div>}
                  {hasPartialStopWork && <div className="text-score-yellow">⚠ {orders.partial_stop_work?.length} Partial SWO</div>}
                  {hasVacateOrder && <div className="text-destructive">⚠ {orders.vacate?.length} Vacate</div>}
                  {!hasCriticalOrders && <div className="text-muted-foreground">None detected</div>}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Critical Orders */}
      {hasCriticalOrders && (
        <Card id="critical-orders-section" className="border-destructive/50 bg-destructive/5">
          <Collapsible open={criticalOrdersOpen} onOpenChange={setCriticalOrdersOpen}>
            <CardHeader className="cursor-pointer" onClick={() => setCriticalOrdersOpen(!criticalOrdersOpen)}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between w-full">
                  <CardTitle className="flex items-center gap-2 text-destructive">
                    {criticalOrdersOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <FileWarning className="w-5 h-5" />
                    Critical Items ({(orders.stop_work?.length || 0) + (orders.partial_stop_work?.length || 0) + (orders.vacate?.length || 0)})
                  </CardTitle>
                </div>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-4 pt-0">
                {orders.stop_work?.map((order: any, idx: number) => (
                  <div key={`swo-${idx}`} className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive">Full Stop Work Order</Badge>
                        <span className="font-mono text-sm text-muted-foreground">#{order.violation_number || order.id || `SWO-${idx + 1}`}</span>
                      </div>
                      <span className="text-sm font-medium">{safeFormatDate(order.issued_date)}</span>
                    </div>
                    <p className="text-sm">{order.description_raw || order.violation_type || 'No description'}</p>
                    <Input placeholder="Add note..." value={lineItemNotes[`swo-${idx}`] || ''} onChange={(e) => updateLineItemNote('swo', String(idx), e.target.value)} className="mt-2 bg-background" />
                  </div>
                ))}
                {orders.partial_stop_work?.map((order: any, idx: number) => (
                  <div key={`pswo-${idx}`} className="p-3 rounded-lg bg-score-yellow/10 border border-score-yellow/30">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="secondary">Partial Stop Work</Badge>
                      <span className="text-sm font-medium">{safeFormatDate(order.issued_date)}</span>
                    </div>
                    <p className="text-sm">{order.description_raw || order.violation_type || 'No description'}</p>
                    <Input placeholder="Add note..." value={lineItemNotes[`pswo-${idx}`] || ''} onChange={(e) => updateLineItemNote('pswo', String(idx), e.target.value)} className="mt-2 bg-background" />
                  </div>
                ))}
                {orders.vacate?.map((order: any, idx: number) => (
                  <div key={`vacate-${idx}`} className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="destructive">Vacate Order</Badge>
                      <span className="text-sm font-medium">{safeFormatDate(order.issued_date)}</span>
                    </div>
                    <p className="text-sm">{order.description_raw || order.violation_type || 'No description'}</p>
                    <Input placeholder="Add note..." value={lineItemNotes[`vacate-${idx}`] || ''} onChange={(e) => updateLineItemNote('vacate', String(idx), e.target.value)} className="mt-2 bg-background" />
                  </div>
                ))}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="violations" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 h-12">
          <TabsTrigger value="violations" className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Violations
            <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{violations.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="applications" className="flex items-center gap-2 text-sm font-medium">
            <FileStack className="w-4 h-4 shrink-0" /> Applications
            <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{applications.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="ai-analysis" className="flex items-center gap-2 text-sm font-medium">
            <StickyNote className="w-4 h-4 shrink-0" /> AI Analysis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="violations">
          <Card>
            <CardHeader>
              <CardTitle>Open Violations ({violations.length})</CardTitle>
              <CardDescription>{dobViolations.length} DOB • {ecbViolations.length} ECB • {hpdViolations.length} HPD</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                {['all', 'DOB', 'ECB', 'HPD'].map(f => (
                  <Button key={f} variant={violationFilter === f ? 'default' : 'outline'} size="sm" onClick={() => setViolationFilter(f)}>
                    {f === 'all' ? `All (${violations.length})` : `${f} (${violations.filter((v: any) => v.agency === f).length})`}
                  </Button>
                ))}
              </div>
              {violations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No open violations found.</div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Violation #</TableHead>
                        <TableHead>Agency</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Issued</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Notes</TableHead>
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
                          />
                        ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="applications">
          <Card>
            <CardHeader>
              <CardTitle>Permit Applications ({applications.length})</CardTitle>
              <CardDescription>{bisApplications.length} BIS • {dobNowApplications.length} DOB NOW Build</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                <Button variant={applicationFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setApplicationFilter('all')}>
                  All ({applications.length})
                </Button>
                <Button variant={applicationFilter === 'R' ? 'default' : 'outline'} size="sm" onClick={() => setApplicationFilter('R')}>
                  Permit Entire ({applications.filter((a: any) => { const s = (a.status || '').toUpperCase(); return s === 'R' || s.includes('PERMIT ENTIRE'); }).length})
                </Button>
                <Button variant={applicationFilter === 'in_process' ? 'default' : 'outline'} size="sm" onClick={() => setApplicationFilter('in_process')}>
                  In Process ({applications.filter((a: any) => { const s = (a.status || '').toUpperCase(); return ['A','B','C','D','E','F','G','H','K','L','M'].includes(s) || s.includes('FILED') || s.includes('PLAN EXAM'); }).length})
                </Button>
              </div>
              {applications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No applications found.</div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Job #</TableHead>
                        <TableHead>Job Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Filed</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Floor/Apt</TableHead>
                        <TableHead>Notes</TableHead>
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
                            />
                          );
                        })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai-analysis">
          <Card>
            <CardHeader>
              <CardTitle>AI Analysis</CardTitle>
              <CardDescription>AI-generated risk assessment</CardDescription>
            </CardHeader>
            <CardContent>
              {report.ai_analysis ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <div className="whitespace-pre-wrap">{report.ai_analysis}</div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">AI analysis not available.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* General Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <StickyNote className="w-5 h-5" /> General Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea placeholder="Enter general notes..." value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)} rows={5} />
        </CardContent>
      </Card>

      {/* Hidden print view */}
      <div className="fixed -left-[9999px] -top-[9999px]">
        <div ref={printRef}>
          <DDReportPrintView report={{
            ...report,
            general_notes: generalNotes || report.general_notes,
            line_item_notes: Object.entries(lineItemNotes).map(([key, note]) => {
              const [item_type, ...rest] = key.split('-');
              return { item_type, item_id: rest.join('-'), note };
            }).filter(n => n.note.trim()),
          }} userProfile={userProfile} />
        </div>
      </div>
    </div>
  );
};

export default DDReportViewer;
