import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  FileText, ExternalLink, Upload, Paperclip, AlertTriangle,
  Loader2, CheckCircle2, Clock, UserCheck, Search, Download, Ban,
} from 'lucide-react';

type DocStatus = 'pending' | 'needs_manual_pull' | 'in_progress' | 'attached' | 'unavailable' | 'not_applicable';

interface DocRow {
  id: string;
  report_id: string;
  agency: string;
  doc_type: string;
  doc_ref: string | null;
  title: string | null;
  source_url: string | null;
  status: DocStatus;
  file_path: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  fetched_by: string | null;
  fetched_at: string | null;
  notes: string | null;
  priority: number;
  created_at: string;
  updated_at: string;
  // Joined columns from dd_reports
  report?: { address: string; bin: string | null; bbl: string | null } | null;
}

const STATUS_META: Record<DocStatus, { label: string; tone: string; icon: typeof Clock }> = {
  pending: { label: 'Pending', tone: 'bg-slate-100 text-slate-700 border-slate-200', icon: Clock },
  needs_manual_pull: { label: 'Needs pull', tone: 'bg-amber-100 text-amber-800 border-amber-200', icon: AlertTriangle },
  in_progress: { label: 'In progress', tone: 'bg-blue-100 text-blue-800 border-blue-200', icon: UserCheck },
  attached: { label: 'Attached', tone: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle2 },
  unavailable: { label: 'Unavailable', tone: 'bg-rose-100 text-rose-800 border-rose-200', icon: Ban },
  not_applicable: { label: 'N/A', tone: 'bg-gray-100 text-gray-600 border-gray-200', icon: Ban },
};

const formatBytes = (n: number | null) => {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const AdminDocuments = () => {
  const navigate = useNavigate();
  const { isStaff, isLoading: roleLoading, isAdmin, isAnalyst } = useUserRole();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [agencyFilter, setAgencyFilter] = useState<string>('all');
  const [tab, setTab] = useState<DocStatus | 'open'>('open');
  const [selected, setSelected] = useState<DocRow | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadNotes, setUploadNotes] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id || null);
    });
  }, []);

  // Route guard - UX only; RLS is the real protection.
  useEffect(() => {
    if (!roleLoading && !isStaff) {
      navigate('/dashboard', { replace: true });
    }
  }, [roleLoading, isStaff, navigate]);

  // --- Query the queue ------------------------------------------------
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['report-documents-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('report_documents')
        .select(`
          *,
          report:dd_reports!report_documents_report_id_fkey (
            address, bin, bbl
          )
        `)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data as unknown as DocRow[]) || [];
    },
    enabled: isStaff,
  });

  // --- Counts for tabs ------------------------------------------------
  const counts = useMemo(() => {
    const c: Record<string, number> = {
      open: 0, needs_manual_pull: 0, in_progress: 0,
      attached: 0, unavailable: 0, not_applicable: 0, pending: 0,
    };
    for (const d of docs) {
      c[d.status] = (c[d.status] || 0) + 1;
      if (d.status === 'pending' || d.status === 'needs_manual_pull' || d.status === 'in_progress') {
        c.open += 1;
      }
    }
    return c;
  }, [docs]);

  // --- Filtering ------------------------------------------------------
  const filteredDocs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return docs.filter((d) => {
      // Tab filter
      if (tab === 'open') {
        if (d.status !== 'pending' && d.status !== 'needs_manual_pull' && d.status !== 'in_progress') {
          return false;
        }
      } else if (d.status !== tab) {
        return false;
      }
      // Agency filter
      if (agencyFilter !== 'all' && d.agency !== agencyFilter) return false;
      // Search
      if (term) {
        const haystack = [
          d.title, d.doc_ref, d.doc_type, d.agency,
          d.report?.address, d.report?.bin, d.report?.bbl,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [docs, search, agencyFilter, tab]);

  // --- Agencies present (for filter dropdown) -------------------------
  const agencies = useMemo(() => {
    const set = new Set<string>();
    docs.forEach((d) => set.add(d.agency));
    return Array.from(set).sort();
  }, [docs]);

  // --- Mutations ------------------------------------------------------
  const claimMutation = useMutation({
    mutationFn: async (docId: string) => {
      if (!userId) throw new Error('Not signed in');
      const { error } = await supabase
        .from('report_documents')
        .update({
          status: 'in_progress',
          claimed_by: userId,
          claimed_at: new Date().toISOString(),
        })
        .eq('id', docId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-documents-queue'] });
      toast.success('Claimed');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const releaseMutation = useMutation({
    mutationFn: async (docId: string) => {
      const { error } = await supabase
        .from('report_documents')
        .update({
          status: 'needs_manual_pull',
          claimed_by: null,
          claimed_at: null,
        })
        .eq('id', docId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-documents-queue'] });
      toast.success('Released');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const markStatusMutation = useMutation({
    mutationFn: async ({ docId, status, notes }: { docId: string; status: DocStatus; notes?: string }) => {
      const update: any = { status };
      if (notes !== undefined) update.notes = notes;
      const { error } = await supabase
        .from('report_documents')
        .update(update)
        .eq('id', docId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-documents-queue'] });
      toast.success('Updated');
      setSelected(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // --- File upload ----------------------------------------------------
  const handleUpload = async (file: File) => {
    if (!selected || !userId) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'pdf';
      const path = `${selected.report_id}/${selected.id}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('report-documents')
        .upload(path, file, { upsert: true, contentType: file.type || 'application/pdf' });
      if (upErr) throw upErr;

      const { error: rowErr } = await supabase
        .from('report_documents')
        .update({
          status: 'attached',
          file_path: path,
          file_size_bytes: file.size,
          mime_type: file.type || 'application/pdf',
          fetched_by: userId,
          fetched_at: new Date().toISOString(),
          notes: uploadNotes || selected.notes,
        })
        .eq('id', selected.id);
      if (rowErr) throw rowErr;

      toast.success('Document attached');
      queryClient.invalidateQueries({ queryKey: ['report-documents-queue'] });
      setSelected(null);
      setUploadNotes('');
    } catch (e: any) {
      toast.error(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: DocRow) => {
    if (!doc.file_path) return;
    const { data, error } = await supabase.storage
      .from('report-documents')
      .createSignedUrl(doc.file_path, 60 * 10); // 10 min
    if (error || !data?.signedUrl) {
      toast.error('Could not generate download link');
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  // --- Render ---------------------------------------------------------
  if (roleLoading) {
    return (
      <div className="container mx-auto py-10 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (!isStaff) return null;

  return (
    <div className="container mx-auto py-10 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Paperclip className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Document queue</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Tickets here represent documents referenced in DD reports. For high-value items (deeds,
              liens, vacate orders) an analyst can fetch the PDF via the agency portal and attach it.
              Bulk PDF feeds (the way Jaffa/DataTrace operate) require an agency data-services
              agreement — these tickets are the bridge until those agreements are in place.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
            {counts.open} open
          </Badge>
          <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200">
            {counts.attached} attached
          </Badge>
          {(isAdmin || isAnalyst) ? null : (
            <Badge variant="outline">Read-only (sales)</Badge>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search title, doc ref, address, BIN, BBL..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={agencyFilter} onValueChange={setAgencyFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Agency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agencies</SelectItem>
            {agencies.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="open">Open ({counts.open})</TabsTrigger>
          <TabsTrigger value="needs_manual_pull">Needs pull ({counts.needs_manual_pull || 0})</TabsTrigger>
          <TabsTrigger value="in_progress">In progress ({counts.in_progress || 0})</TabsTrigger>
          <TabsTrigger value="attached">Attached ({counts.attached || 0})</TabsTrigger>
          <TabsTrigger value="unavailable">Unavailable ({counts.unavailable || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : filteredDocs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No documents in this view</p>
                <p className="text-sm mt-1">
                  {tab === 'open' ? 'The analyst queue is clear.' : 'Try a different filter.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredDocs.map((doc) => {
                const meta = STATUS_META[doc.status];
                const Icon = meta.icon;
                const claimedByMe = doc.claimed_by === userId;
                return (
                  <Card key={doc.id} className="hover:border-primary/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-[260px] space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className={`${meta.tone} border`}>
                              <Icon className="h-3 w-3 mr-1" />
                              {meta.label}
                            </Badge>
                            <Badge variant="outline">{doc.agency}</Badge>
                            <Badge variant="outline" className="capitalize">{doc.doc_type.replace(/_/g, ' ')}</Badge>
                            {doc.priority <= 2 && (
                              <Badge className="bg-rose-600 hover:bg-rose-600">High priority</Badge>
                            )}
                          </div>
                          <div className="font-medium">{doc.title || `${doc.agency} ${doc.doc_type}`}</div>
                          {doc.doc_ref && (
                            <div className="text-xs text-muted-foreground font-mono">{doc.doc_ref}</div>
                          )}
                          {doc.report && (
                            <div className="text-sm text-muted-foreground">
                              <span className="font-medium">{doc.report.address}</span>
                              {doc.report.bin && <> · BIN {doc.report.bin}</>}
                              {doc.report.bbl && <> · BBL {doc.report.bbl}</>}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            Created {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
                            {doc.claimed_at && doc.claimed_by && (
                              <> · Claimed {formatDistanceToNow(new Date(doc.claimed_at), { addSuffix: true })}{claimedByMe ? ' by you' : ''}</>
                            )}
                            {doc.file_size_bytes && (
                              <> · {formatBytes(doc.file_size_bytes)}</>
                            )}
                          </div>
                          {doc.notes && (
                            <div className="text-xs text-muted-foreground italic mt-1">
                              Note: {doc.notes}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 items-start">
                          {doc.source_url && (
                            <Button asChild size="sm" variant="outline">
                              <a href={doc.source_url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3 w-3 mr-1" />
                                Open portal
                              </a>
                            </Button>
                          )}
                          {doc.status === 'attached' && doc.file_path && (
                            <Button size="sm" variant="outline" onClick={() => handleDownload(doc)}>
                              <Download className="h-3 w-3 mr-1" />
                              Download PDF
                            </Button>
                          )}
                          {(isAdmin || isAnalyst) && (
                            <>
                              {(doc.status === 'pending' || doc.status === 'needs_manual_pull') && (
                                <Button
                                  size="sm"
                                  onClick={() => claimMutation.mutate(doc.id)}
                                  disabled={claimMutation.isPending}
                                >
                                  Claim
                                </Button>
                              )}
                              {doc.status === 'in_progress' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => releaseMutation.mutate(doc.id)}
                                  disabled={releaseMutation.isPending}
                                >
                                  Release
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => { setSelected(doc); setUploadNotes(doc.notes || ''); }}
                              >
                                <Upload className="h-3 w-3 mr-1" />
                                {doc.status === 'attached' ? 'Replace' : 'Attach PDF'}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Attach / mark dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setUploadNotes(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach document</DialogTitle>
            <DialogDescription>
              {selected?.title} {selected?.doc_ref && `· ${selected.doc_ref}`}
              <br />
              {selected?.report?.address}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selected?.source_url && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium mb-1">Step 1 — Pull the PDF</p>
                <p className="text-muted-foreground text-xs mb-2">
                  Open the agency portal, search by the doc ref above, and download the PDF.
                </p>
                <Button asChild size="sm" variant="outline">
                  <a href={selected.source_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Open {selected.agency} portal
                  </a>
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <p className="font-medium text-sm">Step 2 — Upload here</p>
              <Input
                type="file"
                accept="application/pdf,image/*"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
              />
              {uploading && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                </p>
              )}
            </div>

            <div className="space-y-2">
              <p className="font-medium text-sm">Notes (optional)</p>
              <Textarea
                value={uploadNotes}
                onChange={(e) => setUploadNotes(e.target.value)}
                placeholder="Any caveats, e.g. 'page 3 missing on agency site', 'doc sealed by court order'..."
                rows={2}
              />
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              Or mark the document as:
              <div className="flex gap-2 mt-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={markStatusMutation.isPending}
                  onClick={() => selected && markStatusMutation.mutate({
                    docId: selected.id, status: 'unavailable', notes: uploadNotes || selected.notes || undefined,
                  })}
                >
                  <Ban className="h-3 w-3 mr-1" />
                  Unavailable
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={markStatusMutation.isPending}
                  onClick={() => selected && markStatusMutation.mutate({
                    docId: selected.id, status: 'not_applicable', notes: uploadNotes || selected.notes || undefined,
                  })}
                >
                  Not applicable
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDocuments;
