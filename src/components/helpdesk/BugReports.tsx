import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Bug, CheckCircle2, Plus, Clock, Filter, ArrowUpDown, Loader2,
  Upload, Video, X, Image as ImageIcon, Copy, Send, MessageSquare,
  Eye, Paperclip, FileIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { useUserRole } from "@/hooks/useUserRole";

const PAGES = [
  "Dashboard", "DD Reports", "Report Viewer", "Property Search",
  "Order Page", "Settings", "Auth / Login", "Help Center", "Other",
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "ready_for_review", label: "Ready for Review" },
  { value: "resolved", label: "Resolved" },
];

const PRIORITY_OPTIONS = [
  { value: "all", label: "All Priorities" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const statusIcon = (status: string) => {
  if (status === "resolved") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === "ready_for_review") return <Eye className="h-4 w-4 text-purple-500" />;
  if (status === "in_progress") return <Clock className="h-4 w-4 text-amber-500" />;
  return <Bug className="h-4 w-4 text-destructive" />;
};

const priorityVariant = (p: string) =>
  p === "critical" || p === "high" ? "destructive" as const : "secondary" as const;

function toLoomEmbed(url: string): string | null {
  const match = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
  return match ? `https://www.loom.com/embed/${match[1]}` : null;
}

export function BugReports() {
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRole();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "priority">("newest");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState("");
  const [action, setAction] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [priority, setPriority] = useState("medium");
  const [loomUrl, setLoomUrl] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // Detail sheet
  const [selectedBug, setSelectedBug] = useState<any>(null);
  const [editStatus, setEditStatus] = useState("");
  const [newComment, setNewComment] = useState("");
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const [statusComment, setStatusComment] = useState("");

  // Get current user
  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  // Fetch bug reports
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["bug-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bug_reports" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  // Fetch comments for selected bug
  const { data: comments = [] } = useQuery({
    queryKey: ["bug-comments", selectedBug?.id],
    queryFn: async () => {
      if (!selectedBug?.id) return [];
      const { data, error } = await supabase
        .from("bug_comments" as any)
        .select("*")
        .eq("bug_id", selectedBug.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!selectedBug?.id,
  });

  // Stats
  const openCount = reports.filter((r: any) => r.status === "open").length;
  const inProgressCount = reports.filter((r: any) => r.status === "in_progress").length;
  const readyForReviewCount = reports.filter((r: any) => r.status === "ready_for_review").length;
  const resolvedCount = reports.filter((r: any) => r.status === "resolved").length;
  const criticalCount = reports.filter((r: any) => r.priority === "critical" && r.status !== "resolved").length;

  // Filter + sort
  const filtered = reports
    .filter((r: any) => statusFilter === "all" || r.status === statusFilter)
    .filter((r: any) => priorityFilter === "all" || r.priority === priorityFilter)
    .sort((a: any, b: any) => {
      if (sortBy === "priority") return (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
      if (sortBy === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const uploadFiles = async (bugId: string, files: File[]): Promise<Array<{ url: string; name: string; type: string }>> => {
    const results: Array<{ url: string; name: string; type: string }> = [];
    for (const file of files) {
      const path = `${bugId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("bug-attachments").upload(path, file);
      if (!error) {
        const { data: urlData } = supabase.storage.from("bug-attachments").getPublicUrl(path);
        results.push({ url: urlData.publicUrl, name: file.name, type: file.type });
      }
    }
    return results;
  };

  const submitBug = useMutation({
    mutationFn: async () => {
      const user = currentUser;
      if (!user) throw new Error("Not authenticated");
      const description = `**Page:** ${page}\n**Action:** ${action}\n**Expected:** ${expected}\n**Actual:** ${actual}`;

      const { data: inserted, error } = await supabase.from("bug_reports" as any).insert({
        user_id: user.id,
        title: `[${page}] ${action.slice(0, 80)}`,
        description,
        page,
        priority,
        status: "open",
        loom_url: loomUrl || null,
      }).select("id").single();
      if (error) throw error;

      if (pendingFiles.length > 0 && inserted) {
        const attachments = await uploadFiles((inserted as any).id, pendingFiles);
        await supabase.from("bug_reports" as any).update({ attachments }).eq("id", (inserted as any).id);
      }
    },
    onSuccess: () => {
      toast.success("Bug report submitted!");
      queryClient.invalidateQueries({ queryKey: ["bug-reports"] });
      setShowForm(false);
      setPage(""); setAction(""); setExpected(""); setActual(""); setPriority("medium");
      setLoomUrl(""); setPendingFiles([]);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateBug = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase
        .from("bug_reports" as any)
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bug updated");
      queryClient.invalidateQueries({ queryKey: ["bug-reports"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteBug = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bug_reports" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bug deleted");
      queryClient.invalidateQueries({ queryKey: ["bug-reports"] });
      setSelectedBug(null);
    },
  });

  const postComment = useMutation({
    mutationFn: async ({ message, files }: { message: string; files: File[] }) => {
      if (!selectedBug || !currentUser) throw new Error("Missing context");

      let attachmentData: Array<{ url: string; name: string; type: string }> | null = null;
      if (files.length > 0) {
        attachmentData = [];
        for (const file of files) {
          const path = `${selectedBug.id}/comments/${Date.now()}-${file.name}`;
          const { error: uploadErr } = await supabase.storage.from("bug-attachments").upload(path, file);
          if (!uploadErr) {
            const { data: urlData } = supabase.storage.from("bug-attachments").getPublicUrl(path);
            attachmentData.push({ url: urlData.publicUrl, name: file.name, type: file.type });
          }
        }
      }

      const { error } = await supabase.from("bug_comments" as any).insert({
        bug_id: selectedBug.id,
        user_id: currentUser.id,
        message,
        attachments: attachmentData,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewComment("");
      setCommentFiles([]);
      queryClient.invalidateQueries({ queryKey: ["bug-comments", selectedBug?.id] });
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openDetail = (bug: any) => {
    setSelectedBug(bug);
    setEditStatus(bug.status || "open");
    setNewComment("");
    setCommentFiles([]);
    setStatusComment("");
  };

  const saveDetail = async () => {
    if (!selectedBug) return;

    const isReadyForReview = editStatus === "ready_for_review" && selectedBug.status !== "ready_for_review";
    const isNewlyResolved = editStatus === "resolved" && selectedBug.status !== "resolved";

    if ((isReadyForReview || isNewlyResolved) && !statusComment.trim()) {
      toast.error(`Please add a comment before marking as ${isReadyForReview ? "Ready for Review" : "Resolved"}.`);
      return;
    }

    // Post status comment first if needed
    if ((isReadyForReview || isNewlyResolved) && statusComment.trim()) {
      await supabase.from("bug_comments" as any).insert({
        bug_id: selectedBug.id,
        user_id: currentUser!.id,
        message: statusComment.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ["bug-comments", selectedBug.id] });
    }

    const updates: Record<string, any> = { status: editStatus };
    if (isNewlyResolved) updates.resolved_at = new Date().toISOString();
    if (editStatus !== "resolved") updates.resolved_at = null;

    updateBug.mutate({ id: selectedBug.id, updates }, {
      onSuccess: () => setSelectedBug(null),
    });
  };

  const copyForLovable = () => {
    if (!selectedBug) return;
    const attachments = getAttachments(selectedBug);
    const parts = [
      `**Bug Report: ${selectedBug.title}**`,
      `Priority: ${selectedBug.priority}`,
      "",
      selectedBug.description,
    ];
    if (selectedBug.loom_url) parts.push("", `Loom: ${selectedBug.loom_url}`);
    if (attachments.length > 0) parts.push("", `Screenshots:\n${attachments.map((a: any) => `- ${a.url}`).join("\n")}`);
    parts.push("", "Please analyze this bug and suggest a fix.");
    navigator.clipboard.writeText(parts.join("\n"));
    toast.success("Copied to clipboard — paste into Lovable chat");
  };

  const getAttachments = (bug: any): Array<{ url: string; name: string; type: string }> => {
    if (!bug.attachments) return [];
    try {
      return Array.isArray(bug.attachments) ? bug.attachments : JSON.parse(bug.attachments);
    } catch { return []; }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Bug Reports</h2>
          <p className="text-sm text-muted-foreground">Track, assign, and resolve issues.</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />
          Report Bug
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Open", count: openCount, color: "text-destructive", filter: "open" },
          { label: "In Progress", count: inProgressCount, color: "text-amber-500", filter: "in_progress" },
          { label: "Review", count: readyForReviewCount, color: "text-purple-500", filter: "ready_for_review" },
          { label: "Resolved", count: resolvedCount, color: "text-green-500", filter: "resolved" },
          { label: "Critical", count: criticalCount, color: "text-destructive", filter: "critical" },
        ].map((s) => (
          <Card
            key={s.label}
            className="cursor-pointer hover:ring-2 ring-primary/30 transition-all"
            onClick={() => {
              if (s.filter === "critical") { setPriorityFilter("critical"); setStatusFilter("all"); }
              else { setStatusFilter(s.filter); setPriorityFilter("all"); }
            }}
          >
            <CardContent className="py-3 px-4 text-center">
              <p className={cn("text-2xl font-bold", s.color)}>{s.count}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Submit form */}
      {showForm && (
        <Card>
          <CardContent className="py-4 px-4 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Bug className="h-4 w-4" />
              <span className="font-semibold text-sm">New Bug Report</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Page / Area</Label>
                <Select value={page} onValueChange={setPage}>
                  <SelectTrigger><SelectValue placeholder="Select page..." /></SelectTrigger>
                  <SelectContent>
                    {PAGES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>What did you do?</Label>
              <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. Clicked 'Generate Report' button" />
            </div>
            <div className="space-y-2">
              <Label>What should have happened?</Label>
              <Textarea value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="Expected behavior..." rows={2} />
            </div>
            <div className="space-y-2">
              <Label>What actually happened?</Label>
              <Textarea value={actual} onChange={(e) => setActual(e.target.value)} placeholder="Actual behavior..." rows={2} />
            </div>

            {/* Screenshots upload */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" /> Screenshots</Label>
              <div
                className="border-2 border-dashed rounded-md p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
                  setPendingFiles((prev) => [...prev, ...files]);
                }}
              >
                <Upload className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Click or drag screenshots here</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) setPendingFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                  }}
                />
              </div>
              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {pendingFiles.map((f, i) => (
                    <div key={i} className="relative group">
                      <img src={URL.createObjectURL(f)} alt={f.name} className="h-16 w-16 object-cover rounded border" />
                      <button
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Loom URL */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1"><Video className="h-3.5 w-3.5" /> Loom / Video Link (optional)</Label>
              <Input value={loomUrl} onChange={(e) => setLoomUrl(e.target.value)} placeholder="https://www.loom.com/share/..." />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setPendingFiles([]); setLoomUrl(""); }}>Cancel</Button>
              <Button size="sm" disabled={!page || !action || !expected || !actual || submitBug.isPending} onClick={() => submitBug.mutate()}>
                {submitBug.isPending ? "Submitting..." : "Submit Bug Report"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <ArrowUpDown className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
            <SelectItem value="priority">Priority</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Bug className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No bug reports found.</p>
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-24">Priority</TableHead>
                <TableHead className="w-16">Media</TableHead>
                <TableHead className="w-24">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((bug: any) => {
                const attachments = getAttachments(bug);
                const hasMedia = attachments.length > 0 || !!bug.loom_url;
                return (
                  <TableRow key={bug.id} className="cursor-pointer" onClick={() => openDetail(bug)}>
                    <TableCell>{statusIcon(bug.status)}</TableCell>
                    <TableCell>
                      <span className="font-medium text-sm">{bug.title}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={priorityVariant(bug.priority)} className="text-xs">{bug.priority}</Badge>
                    </TableCell>
                    <TableCell>
                      {hasMedia && (
                        <div className="flex gap-1">
                          {attachments.length > 0 && <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />}
                          {bug.loom_url && <Video className="h-3.5 w-3.5 text-muted-foreground" />}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(bug.created_at), "MMM d")}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selectedBug} onOpenChange={(open) => !open && setSelectedBug(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedBug && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {statusIcon(selectedBug.status)}
                  <span className="truncate">{selectedBug.title}</span>
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4">
                {/* Description */}
                <div>
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <div className="mt-1 space-y-3 text-sm bg-muted/50 rounded-md p-4">
                    {(() => {
                      const raw = (selectedBug.description || "").replace(/\\n/g, "\n");
                      const fieldRegex = /\*\*(.+?):\*\*\s*([\s\S]*?)(?=\n\*\*|\n\n|$)/g;
                      const fields: { label: string; value: string }[] = [];
                      let match;
                      while ((match = fieldRegex.exec(raw)) !== null) {
                        fields.push({ label: match[1].trim(), value: match[2].trim() });
                      }
                      if (fields.length > 0) {
                        return fields.map((f, i) => (
                          <div key={i} className="space-y-0.5">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{f.label}</p>
                            <p className="text-foreground whitespace-pre-line leading-relaxed">{f.value}</p>
                          </div>
                        ));
                      }
                      return <p className="text-foreground whitespace-pre-line leading-relaxed">{raw}</p>;
                    })()}
                  </div>
                </div>

                {/* Attachments */}
                {getAttachments(selectedBug).length > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Screenshots</Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {getAttachments(selectedBug).map((att: any, i: number) => (
                        <a key={i} href={att.url} target="_blank" rel="noopener noreferrer">
                          <img src={att.url} alt={att.name} className="h-24 w-auto rounded border hover:ring-2 ring-primary transition-all" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Loom embed */}
                {selectedBug.loom_url && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Video</Label>
                    {toLoomEmbed(selectedBug.loom_url) ? (
                      <div className="mt-1 rounded-md overflow-hidden border aspect-video">
                        <iframe src={toLoomEmbed(selectedBug.loom_url)!} className="w-full h-full" allowFullScreen />
                      </div>
                    ) : (
                      <a href={selectedBug.loom_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline mt-1 block">
                        {selectedBug.loom_url}
                      </a>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Priority</Label>
                    <div className="mt-1">
                      <Badge variant={priorityVariant(selectedBug.priority)}>{selectedBug.priority}</Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Reported</Label>
                    <p className="mt-1 text-sm">{format(new Date(selectedBug.created_at), "MMM d, yyyy")}</p>
                  </div>
                </div>

                {/* Comments Thread */}
                <div className="border-t pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <h4 className="font-semibold text-sm">Comments</h4>
                    {comments.length > 0 && <Badge variant="secondary" className="text-xs">{comments.length}</Badge>}
                  </div>
                  {comments.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">No comments yet.</p>
                  ) : (
                    <div className="space-y-3 max-h-64 overflow-y-auto mb-3">
                      {comments.map((c: any) => {
                        const isCurrentUser = c.user_id === currentUser?.id;
                        const commentAttachments: Array<{ url: string; name: string; type: string }> = (() => {
                          if (!c.attachments) return [];
                          try { return Array.isArray(c.attachments) ? c.attachments : JSON.parse(c.attachments); } catch { return []; }
                        })();
                        return (
                          <div key={c.id} className={cn("rounded-lg p-3 text-sm", isCurrentUser ? "bg-primary/10 ml-4" : "bg-muted/50 mr-4")}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-xs">{isCurrentUser ? "You" : "Team"}</span>
                              <span className="text-xs text-muted-foreground">{format(new Date(c.created_at), "MMM d, h:mm a")}</span>
                            </div>
                            <p className="text-foreground whitespace-pre-line">{c.message}</p>
                            {commentAttachments.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {commentAttachments.map((att, i) =>
                                  att.type?.startsWith("image/") ? (
                                    <a key={i} href={att.url} target="_blank" rel="noopener noreferrer">
                                      <img src={att.url} alt={att.name} className="h-20 w-auto rounded border hover:ring-2 ring-primary transition-all" />
                                    </a>
                                  ) : (
                                    <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary underline">
                                      <FileIcon className="h-3 w-3" />{att.name}
                                    </a>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div ref={commentsEndRef} />
                    </div>
                  )}
                  {/* Comment file previews */}
                  {commentFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {commentFiles.map((f, i) => (
                        <div key={i} className="relative group">
                          {f.type.startsWith("image/") ? (
                            <img src={URL.createObjectURL(f)} alt={f.name} className="h-14 w-14 object-cover rounded border" />
                          ) : (
                            <div className="h-14 w-14 rounded border flex items-center justify-center bg-muted">
                              <FileIcon className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <button
                            className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setCommentFiles((prev) => prev.filter((_, j) => j !== i))}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Write a comment..."
                      rows={3}
                      className="resize-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && (newComment.trim() || commentFiles.length > 0)) {
                          e.preventDefault();
                          postComment.mutate({ message: newComment.trim(), files: commentFiles });
                        }
                      }}
                    />
                    <div className="flex gap-2 justify-end">
                      <input
                        ref={commentFileRef}
                        type="file"
                        accept="image/*,.pdf,.doc,.docx"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) setCommentFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                          e.target.value = "";
                        }}
                      />
                      <Button size="sm" variant="outline" onClick={() => commentFileRef.current?.click()} title="Attach file">
                        <Paperclip className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        disabled={(!newComment.trim() && commentFiles.length === 0) || postComment.isPending}
                        onClick={() => postComment.mutate({ message: newComment.trim(), files: commentFiles })}
                      >
                        <Send className="h-4 w-4 mr-1" /> Post
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Copy for Lovable */}
                <div className="border-t pt-4">
                  <Button size="sm" variant="outline" className="w-full" onClick={copyForLovable}>
                    <Copy className="h-3.5 w-3.5 mr-2" />
                    Copy for Lovable
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1 text-center">Copy formatted bug report to paste into Lovable chat</p>
                </div>

                {/* Admin management */}
                {isAdmin && (
                  <div className="border-t pt-4 space-y-4">
                    <h4 className="font-semibold text-sm">Management</h4>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={editStatus} onValueChange={(v) => { setEditStatus(v); setStatusComment(""); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="ready_for_review">Ready for Review</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Required comment for status transitions */}
                    {((editStatus === "ready_for_review" && selectedBug.status !== "ready_for_review") ||
                      (editStatus === "resolved" && selectedBug.status !== "resolved")) && (
                      <div className="space-y-2 rounded-lg border border-accent/30 bg-accent/5 p-3">
                        <Label className="text-sm font-medium">
                          {editStatus === "ready_for_review" ? "What was done?" : "Resolution summary"} <span className="text-destructive">*</span>
                        </Label>
                        <Textarea
                          value={statusComment}
                          onChange={(e) => setStatusComment(e.target.value)}
                          placeholder={editStatus === "ready_for_review" ? "Describe what was fixed..." : "Summarize the resolution..."}
                          rows={3}
                          className="resize-none"
                        />
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveDetail} disabled={updateBug.isPending}>
                        {updateBug.isPending ? "Saving..." :
                          editStatus === "ready_for_review" && selectedBug.status !== "ready_for_review" ? "Mark Ready for Review" :
                          editStatus === "resolved" && selectedBug.status !== "resolved" ? "Mark Resolved" :
                          "Save Changes"}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => {
                        if (confirm("Delete this bug report?")) deleteBug.mutate(selectedBug.id);
                      }}>
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
