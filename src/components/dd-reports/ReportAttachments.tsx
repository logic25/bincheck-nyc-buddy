import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Paperclip, Download, FileText, Clock, AlertTriangle, CheckCircle2, Ban, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface ReportAttachmentsProps {
  reportId: string;
  /** Show all statuses (admin/analyst view) vs only attached (client view). */
  showAllStatuses?: boolean;
}

interface DocRow {
  id: string;
  agency: string;
  doc_type: string;
  doc_ref: string | null;
  title: string | null;
  source_url: string | null;
  status: string;
  file_path: string | null;
  file_size_bytes: number | null;
  fetched_at: string | null;
  notes: string | null;
}

const STATUS_ICON: Record<string, typeof Clock> = {
  attached: CheckCircle2,
  needs_manual_pull: AlertTriangle,
  in_progress: Loader2,
  pending: Clock,
  unavailable: Ban,
  not_applicable: Ban,
};

const STATUS_TONE: Record<string, string> = {
  attached: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  needs_manual_pull: 'bg-amber-100 text-amber-800 border-amber-200',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
  pending: 'bg-slate-100 text-slate-700 border-slate-200',
  unavailable: 'bg-rose-100 text-rose-800 border-rose-200',
  not_applicable: 'bg-gray-100 text-gray-600 border-gray-200',
};

const STATUS_LABEL: Record<string, string> = {
  attached: 'Attached',
  needs_manual_pull: 'Pending pull',
  in_progress: 'In progress',
  pending: 'Queued',
  unavailable: 'Unavailable',
  not_applicable: 'N/A',
};

const formatBytes = (n: number | null): string => {
  if (!n) return '';
  if (n < 1024 * 1024) return ` · ${(n / 1024).toFixed(0)} KB`;
  return ` · ${(n / 1024 / 1024).toFixed(1)} MB`;
};

const ReportAttachments = ({ reportId, showAllStatuses = false }: ReportAttachmentsProps) => {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['report-attachments', reportId, showAllStatuses],
    queryFn: async () => {
      let q = (supabase as any)
        .from('report_documents')
        .select('id, agency, doc_type, doc_ref, title, source_url, status, file_path, file_size_bytes, fetched_at, notes')
        .eq('report_id', reportId)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true });
      if (!showAllStatuses) {
        q = q.eq('status', 'attached');
      }
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as DocRow[]);
    },
  });

  const handleDownload = async (doc: DocRow) => {
    if (!doc.file_path) return;
    setDownloadingId(doc.id);
    try {
      const { data, error } = await supabase.storage
        .from('report-documents')
        .createSignedUrl(doc.file_path, 60 * 10); // 10 minutes
      if (error || !data?.signedUrl) throw new Error('Could not generate download link');
      window.open(data.signedUrl, '_blank');
    } catch (e: any) {
      toast.error(e.message || 'Download failed');
    } finally {
      setDownloadingId(null);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  // In client mode (showAllStatuses=false) with no attached docs, render
  // nothing so we don't show an empty "Documents" card.
  if (docs.length === 0 && !showAllStatuses) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <Paperclip className="h-4 w-4" />
            Source documents
            <Badge variant="outline" className="ml-1">{docs.length}</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            PDFs pulled from NYC agencies by the binchecknyc analyst team
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents in queue yet.</p>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => {
              const Icon = STATUS_ICON[doc.status] || FileText;
              const tone = STATUS_TONE[doc.status] || 'bg-slate-100 text-slate-700 border-slate-200';
              const label = STATUS_LABEL[doc.status] || doc.status;
              const isAttached = doc.status === 'attached' && !!doc.file_path;

              return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-3 rounded-md border bg-card p-3 flex-wrap"
                >
                  <div className="flex-1 min-w-[200px] space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`${tone} border text-xs`}>
                        <Icon className={`h-3 w-3 mr-1 ${doc.status === 'in_progress' ? 'animate-spin' : ''}`} />
                        {label}
                      </Badge>
                      <Badge variant="outline" className="text-xs">{doc.agency}</Badge>
                      <span className="text-sm font-medium">
                        {doc.title || `${doc.agency} ${doc.doc_type}`}
                      </span>
                    </div>
                    {doc.doc_ref && (
                      <div className="text-xs text-muted-foreground font-mono">{doc.doc_ref}</div>
                    )}
                    {isAttached && doc.fetched_at && (
                      <div className="text-xs text-muted-foreground">
                        Attached {format(new Date(doc.fetched_at), 'MMM d, yyyy')}
                        {formatBytes(doc.file_size_bytes)}
                      </div>
                    )}
                    {doc.notes && (
                      <div className="text-xs text-muted-foreground italic">Note: {doc.notes}</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {isAttached ? (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleDownload(doc)}
                        disabled={downloadingId === doc.id}
                      >
                        {downloadingId === doc.id ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Download className="h-3 w-3 mr-1" />
                        )}
                        Download PDF
                      </Button>
                    ) : doc.source_url ? (
                      <Button asChild size="sm" variant="outline">
                        <a href={doc.source_url} target="_blank" rel="noopener noreferrer">
                          Open portal
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ReportAttachments;
