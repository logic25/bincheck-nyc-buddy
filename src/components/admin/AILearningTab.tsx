import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Brain, AlertTriangle, BookOpen, TrendingUp, CheckCircle2, Eye } from 'lucide-react';
import { format } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2, 173 58% 39%))',
  'hsl(var(--chart-3, 197 37% 24%))',
  'hsl(var(--chart-4, 43 74% 66%))',
  'hsl(var(--chart-5, 27 87% 67%))',
];

const ERROR_LABELS: Record<string, string> = {
  too_vague: 'Too Vague',
  wrong_severity: 'Wrong Severity',
  missing_context: 'Missing Context',
  stale_treated_as_active: 'Stale as Active',
  wrong_agency_explanation: 'Wrong Agency',
  missing_note: 'Missing Note',
  factual_error: 'Factual Error',
  tone_style: 'Tone/Style',
  knowledge_gap: 'Knowledge Gap',
  other: 'Other',
};

const AILearningTab = () => {
  const queryClient = useQueryClient();
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  // Accuracy stats
  const { data: accuracyStats, isLoading: statsLoading } = useQuery({
    queryKey: ['ai-accuracy-stats'],
    queryFn: async () => {
      const { data } = await supabase.from('ai_accuracy_stats').select('*').order('edit_rate', { ascending: false });
      return data || [];
    },
  });

  // Knowledge candidates (gaps)
  const { data: knowledgeGaps, isLoading: gapsLoading } = useQuery({
    queryKey: ['knowledge-candidates'],
    queryFn: async () => {
      const { data } = await supabase.from('knowledge_candidates').select('*').order('demand_score', { ascending: false });
      return data || [];
    },
  });

  // Knowledge entries
  const { data: knowledgeEntries, isLoading: entriesLoading } = useQuery({
    queryKey: ['knowledge-entries'],
    queryFn: async () => {
      const { data } = await supabase.from('knowledge_entries').select('*').order('generated_at', { ascending: false });
      return data || [];
    },
  });

  // Approved edits for charts
  const { data: allEdits } = useQuery({
    queryKey: ['all-edits-for-charts'],
    queryFn: async () => {
      const { data } = await supabase.from('report_edits').select('error_category, agency, status, created_at').order('created_at', { ascending: false }).limit(500);
      return data || [];
    },
  });

  // Refresh accuracy stats
  const refreshStats = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('refresh-accuracy-stats');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-accuracy-stats'] });
      toast.success('Accuracy stats refreshed');
    },
    onError: () => toast.error('Failed to refresh stats'),
  });

  // Detect knowledge gaps
  const detectGaps = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('detect-knowledge-gaps');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-candidates'] });
      toast.success('Knowledge gap detection complete');
    },
    onError: () => toast.error('Failed to detect gaps'),
  });

  // Approve/reject knowledge entry
  const reviewEntry = useMutation({
    mutationFn: async ({ entryId, newStatus }: { entryId: string; newStatus: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('knowledge_entries')
        .update({
          status: newStatus,
          approved_by: newStatus === 'approved' ? userData?.user?.id : null,
          approved_at: newStatus === 'approved' ? new Date().toISOString() : null,
        })
        .eq('id', entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-entries'] });
      toast.success('Knowledge entry updated');
    },
    onError: () => toast.error('Failed to update entry'),
  });

  // Generate knowledge from a candidate
  const generateKnowledge = useMutation({
    mutationFn: async (candidateId: string) => {
      const { error } = await supabase.functions.invoke('generate-knowledge-entry', {
        body: { candidate_id: candidateId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-entries'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-candidates'] });
      toast.success('Knowledge entry generated — review below');
    },
    onError: () => toast.error('Failed to generate knowledge entry'),
  });

  // Chart data: error categories
  const errorCategoryData = (() => {
    const counts: Record<string, number> = {};
    (allEdits || []).forEach(e => {
      const cat = e.error_category || 'other';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([key, count]) => ({ name: ERROR_LABELS[key] || key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  })();

  // Chart data: edits by agency
  const agencyData = (() => {
    const counts: Record<string, number> = {};
    (allEdits || []).forEach(e => {
      counts[e.agency] = (counts[e.agency] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  })();

  const totalEdits = allEdits?.length || 0;
  const approvedEdits = allEdits?.filter(e => e.status === 'approved').length || 0;
  const activeKnowledge = knowledgeEntries?.filter(e => e.status === 'approved').length || 0;
  const openGaps = knowledgeGaps?.filter(g => g.status === 'detected').length || 0;

  const isLoading = statsLoading || gapsLoading || entriesLoading;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Health Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Corrections</CardDescription>
            <CardTitle className="text-3xl">{totalEdits}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Approved (Training)</CardDescription>
            <CardTitle className="text-3xl">{approvedEdits}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Knowledge</CardDescription>
            <CardTitle className="text-3xl">{activeKnowledge}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open Gaps</CardDescription>
            <CardTitle className="text-3xl">{openGaps}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Charts */}
      {totalEdits > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Error Categories</CardTitle>
              <CardDescription className="text-xs">Most common AI mistakes</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={errorCategoryData} layout="vertical" margin={{ left: 80, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={80} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Corrections by Agency</CardTitle>
              <CardDescription className="text-xs">Where the AI struggles most</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={agencyData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="count" nameKey="name" label={({ name, count }) => `${name} (${count})`}>
                    {agencyData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Accuracy Stats by Agency */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Accuracy Stats
              </CardTitle>
              <CardDescription>AI note accuracy by agency and item type</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refreshStats.mutate()} disabled={refreshStats.isPending}>
              {refreshStats.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!accuracyStats || accuracyStats.length === 0 ? (
            <p className="text-muted-foreground text-center py-6 text-sm">No accuracy data yet. Click Refresh after approving some edits.</p>
          ) : (
            <div className="space-y-2">
              {accuracyStats.map((stat: any) => (
                <div key={stat.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{stat.agency}</Badge>
                    <span className="text-sm font-medium">{stat.item_type}</span>
                    {stat.violation_type && <span className="text-xs text-muted-foreground">({stat.violation_type})</span>}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">{stat.total_edits} edits / {stat.total_notes_generated} notes</span>
                    <Badge variant={Number(stat.edit_rate) > 0.3 ? 'destructive' : Number(stat.edit_rate) > 0.15 ? 'secondary' : 'default'}>
                      {(Number(stat.edit_rate) * 100).toFixed(1)}% edit rate
                    </Badge>
                    {stat.top_error_category && (
                      <span className="text-xs text-muted-foreground">Top: {ERROR_LABELS[stat.top_error_category] || stat.top_error_category}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Knowledge Gaps */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Knowledge Gaps
              </CardTitle>
              <CardDescription>Systemic issues detected from correction patterns</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => detectGaps.mutate()} disabled={detectGaps.isPending}>
              {detectGaps.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Brain className="w-3 h-3 mr-1" />}
              Detect Gaps
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!knowledgeGaps || knowledgeGaps.length === 0 ? (
            <p className="text-muted-foreground text-center py-6 text-sm">No knowledge gaps detected yet.</p>
          ) : (
            <div className="space-y-2">
              {knowledgeGaps.map((gap: any) => (
                <div key={gap.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{gap.agency}</Badge>
                      <Badge variant={gap.priority === 'high' ? 'destructive' : gap.priority === 'medium' ? 'secondary' : 'outline'} className="text-xs">
                        {gap.priority}
                      </Badge>
                      <span className="text-sm font-medium truncate">{gap.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{gap.trigger_reason}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <Badge variant="outline" className="text-xs">Score: {gap.demand_score}</Badge>
                    {gap.status === 'detected' ? (
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => generateKnowledge.mutate(gap.id)}
                        disabled={generateKnowledge.isPending}
                      >
                        {generateKnowledge.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Brain className="w-3 h-3 mr-1" />}
                        Generate
                      </Button>
                    ) : (
                      <Badge variant="secondary" className="text-xs">{gap.status}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Knowledge Entries */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" /> Knowledge Base
          </CardTitle>
          <CardDescription>AI-generated reference content from analyst corrections</CardDescription>
        </CardHeader>
        <CardContent>
          {!knowledgeEntries || knowledgeEntries.length === 0 ? (
            <p className="text-muted-foreground text-center py-6 text-sm">No knowledge entries yet. Generate one from a detected gap above.</p>
          ) : (
            <div className="space-y-3">
              {knowledgeEntries.map((entry: any) => (
                <div key={entry.id} className="border border-border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{entry.agency}</Badge>
                      <span className="text-sm font-semibold">{entry.title}</span>
                      <Badge variant="outline" className="text-[10px]">{entry.word_count} words</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {entry.status === 'draft' && (
                        <>
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => reviewEntry.mutate({ entryId: entry.id, newStatus: 'approved' })}
                            disabled={reviewEntry.isPending}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => reviewEntry.mutate({ entryId: entry.id, newStatus: 'rejected' })}
                            disabled={reviewEntry.isPending}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      <Badge
                        variant={entry.status === 'approved' ? 'default' : 'secondary'}
                        className={entry.status === 'approved' ? 'bg-emerald-600 text-white' : ''}
                      >
                        {entry.status}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    {expandedEntry === entry.id ? 'Hide' : 'Preview'}
                  </Button>
                  {expandedEntry === entry.id && (
                    <div className="p-3 rounded-md bg-muted/50 border border-border text-sm whitespace-pre-wrap">
                      {entry.content}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Generated {format(new Date(entry.generated_at), 'MMM d, yyyy')}
                    {entry.usage_count > 0 && ` · Used ${entry.usage_count}× in reports`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AILearningTab;
