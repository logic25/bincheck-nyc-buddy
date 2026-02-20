import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Shield, ArrowLeft, Loader2, Zap, Trash2, ChevronRight, ChevronLeft,
  Brain, BarChart3, TrendingUp, DollarSign, Activity, Plus, BookOpen, Search,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays, startOfDay } from 'date-fns';

// ── Types ────────────────────────────────────────────────────────────────────

interface RoadmapItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  ai_tested: boolean;
  ai_evidence: string | null;
  ai_challenges: any;
  ai_duplicate_warning: string | null;
  created_at: string;
}

interface AIResult {
  title: string;
  description: string;
  category: string;
  priority: string;
  evidence: string;
  duplicate_warning: string;
  challenges: { problem: string; solution: string }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_STYLES: Record<string, string> = {
  billing: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  projects: 'bg-violet-500/10 text-violet-600 border-violet-500/30',
  integrations: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
  operations: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
  general: 'bg-muted text-muted-foreground border-border',
};

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-destructive/10 text-destructive border-destructive/30',
  medium: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  low: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
};

const FEATURE_NAME_MAP: Record<string, string> = {
  stress_test: 'Roadmap Stress Test',
  report_generation: 'Report Generation',
  telemetry_analysis: 'Behavior Analysis',
};

const MODEL_NAME_MAP: Record<string, string> = {
  'google/gemini-3-flash-preview': 'Gemini Flash (fast, efficient)',
  'google/gemini-2.5-pro': 'Gemini Pro (most powerful)',
  'google/gemini-2.5-flash': 'Gemini Flash 2.5',
};

const DATE_RANGES = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

const COLUMNS = ['backlog', 'in_progress', 'shipped'] as const;
const COLUMN_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  in_progress: 'In Progress',
  shipped: 'Shipped',
};

// ── Roadmap Card ─────────────────────────────────────────────────────────────

const RoadmapCard = ({
  item,
  onMove,
  onDelete,
  onRunTest,
  isTestingId,
}: {
  item: RoadmapItem;
  onMove: (id: string, newStatus: string) => void;
  onDelete: (id: string) => void;
  onRunTest: (item: RoadmapItem) => void;
  isTestingId: string | null;
}) => {
  const [expanded, setExpanded] = useState(false);
  const challenges: { problem: string; solution: string }[] = item.ai_challenges || [];

  const prevStatus = item.status === 'in_progress' ? 'backlog' : item.status === 'shipped' ? 'in_progress' : null;
  const nextStatus = item.status === 'backlog' ? 'in_progress' : item.status === 'in_progress' ? 'shipped' : null;

  return (
    <Card className="border border-border">
      <CardContent className="p-4 space-y-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium ${CATEGORY_STYLES[item.category] || CATEGORY_STYLES.general}`}>
                {item.category}
              </span>
              <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium ${PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.medium}`}>
                {item.priority}
              </span>
              {item.ai_tested && (
                <span className="inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/30 font-medium">
                  <Zap className="h-3 w-3" /> AI tested
                </span>
              )}
            </div>
            <h4 className="font-semibold text-sm leading-tight">{item.title}</h4>
            {item.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
            )}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete item?</AlertDialogTitle>
                <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(item.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* AI result preview */}
        {item.ai_tested && item.ai_evidence && (
          <div className="space-y-2">
            <button
              className="text-xs text-primary flex items-center gap-1 hover:underline"
              onClick={() => setExpanded(e => !e)}
            >
              <Zap className="h-3 w-3" />
              {expanded ? 'Hide AI analysis' : 'Show AI analysis'}
            </button>
            {expanded && (
              <div className="space-y-2 text-xs border-l-2 border-primary/30 pl-3">
                <p className="text-muted-foreground"><span className="font-semibold text-foreground">Why it matters:</span> {item.ai_evidence}</p>
                {challenges.length > 0 && (
                  <div className="space-y-1">
                    <p className="font-semibold text-foreground">Challenges:</p>
                    {challenges.map((c, i) => (
                      <div key={i} className="text-muted-foreground">
                        <span className="text-destructive font-medium">{c.problem}</span>
                        <span className="mx-1">→</span>
                        <span className="text-emerald-600">{c.solution}</span>
                      </div>
                    ))}
                  </div>
                )}
                {item.ai_duplicate_warning && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2 text-amber-700">
                    ⚠️ {item.ai_duplicate_warning}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            disabled={isTestingId === item.id}
            onClick={() => onRunTest(item)}
          >
            {isTestingId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            {item.ai_tested ? 'Re-test' : 'AI Test'}
          </Button>

          <div className="flex gap-1">
            {prevStatus && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onMove(item.id, prevStatus)}>
                <ChevronLeft className="h-3 w-3" /> Back
              </Button>
            )}
            {nextStatus && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onMove(item.id, nextStatus)}>
                {nextStatus === 'in_progress' ? 'In Progress' : 'Ship it'} <ChevronRight className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ── Add Item Form ─────────────────────────────────────────────────────────────

const AddItemForm = ({
  onAdd,
  existingTitles,
}: {
  onAdd: (item: Omit<RoadmapItem, 'id' | 'created_at'>) => void;
  existingTitles: string[];
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [category, setCategory] = useState('general');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);

  const runTest = async () => {
    if (!title) { toast.error('Enter a title first'); return; }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-telemetry', {
        body: { mode: 'idea', raw_idea: `${title}\n${description}`, existing_titles: existingTitles },
      });
      if (error) throw error;
      setResult(data);
      setPriority(data.priority);
      setCategory(data.category);
      toast.success('AI analysis complete');
    } catch {
      toast.error('AI test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    if (!title.trim()) { toast.error('Title is required'); return; }
    onAdd({
      title: result?.title || title,
      description: result?.description || description || null,
      category,
      priority,
      status: 'backlog',
      ai_tested: !!result,
      ai_evidence: result?.evidence || null,
      ai_challenges: result?.challenges || null,
      ai_duplicate_warning: result?.duplicate_warning || null,
    });
    setTitle('');
    setDescription('');
    setPriority('medium');
    setCategory('general');
    setResult(null);
  };

  return (
    <Card className="border-dashed border-2">
      <CardContent className="p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add to Backlog</p>
        <Input placeholder="Feature title..." value={title} onChange={e => setTitle(e.target.value)} />
        <Textarea placeholder="Description (optional)..." value={description} onChange={e => setDescription(e.target.value)} className="min-h-[60px]" />
        <div className="grid grid-cols-2 gap-2">
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="billing">Billing</SelectItem>
              <SelectItem value="projects">Projects</SelectItem>
              <SelectItem value="integrations">Integrations</SelectItem>
              <SelectItem value="operations">Operations</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {result && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-2 text-xs">
            <p className="font-semibold text-primary">AI Suggestion: {result.title}</p>
            <p className="text-muted-foreground">{result.evidence}</p>
            {result.duplicate_warning && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2 text-amber-700">⚠️ {result.duplicate_warning}</div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={runTest} disabled={testing}>
            {testing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Zap className="h-3 w-3 mr-1" />}
            AI Test
          </Button>
          <Button size="sm" className="flex-1 text-xs" onClick={handleSave}>
            <Plus className="h-3 w-3 mr-1" /> Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const Help = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const [dateRangeDays, setDateRangeDays] = useState(30);

  // Feature Requests state
  const [ideaText, setIdeaText] = useState('');
  const [analyzingIdea, setAnalyzingIdea] = useState(false);
  const [ideaResult, setIdeaResult] = useState<AIResult | null>(null);
  const [scanningTelemetry, setScanningTelemetry] = useState(false);
  const [telemetryGaps, setTelemetryGaps] = useState<{ title: string; description: string; priority: string }[]>([]);

  // Roadmap state
  const [testingItemId, setTestingItemId] = useState<string | null>(null);

  useEffect(() => {
    if (!roleLoading && !isAdmin) navigate('/dashboard');
  }, [roleLoading, isAdmin, navigate]);

  // ── Roadmap queries ──
  const { data: roadmapItems = [], isLoading: loadingRoadmap } = useQuery({
    queryKey: ['roadmap-items'],
    queryFn: async () => {
      const { data, error } = await supabase.from('roadmap_items' as any).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as RoadmapItem[]) || [];
    },
    enabled: isAdmin,
  });

  const addItem = useMutation({
    mutationFn: async (item: Omit<RoadmapItem, 'id' | 'created_at'>) => {
      const { error } = await supabase.from('roadmap_items' as any).insert(item);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['roadmap-items'] }); toast.success('Added to roadmap'); },
    onError: () => toast.error('Failed to add item'),
  });

  const moveItem = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('roadmap_items' as any).update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roadmap-items'] }),
    onError: () => toast.error('Failed to move item'),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('roadmap_items' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['roadmap-items'] }); toast.success('Deleted'); },
    onError: () => toast.error('Failed to delete'),
  });

  const runItemTest = async (item: RoadmapItem) => {
    setTestingItemId(item.id);
    try {
      const existingTitles = roadmapItems.filter(r => r.id !== item.id).map(r => r.title);
      const { data, error } = await supabase.functions.invoke('analyze-telemetry', {
        body: { mode: 'idea', raw_idea: `${item.title}\n${item.description || ''}`, existing_titles: existingTitles },
      });
      if (error) throw error;
      const result: AIResult = data;
      await supabase.from('roadmap_items' as any).update({
        ai_tested: true,
        ai_evidence: result.evidence,
        ai_challenges: result.challenges,
        ai_duplicate_warning: result.duplicate_warning || null,
        priority: result.priority,
        category: result.category,
      }).eq('id', item.id);
      queryClient.invalidateQueries({ queryKey: ['roadmap-items'] });
      toast.success('AI test complete — card updated');
    } catch {
      toast.error('AI test failed');
    } finally {
      setTestingItemId(null);
    }
  };

  // ── AI Usage queries ──
  const rangeStart = subDays(new Date(), dateRangeDays).toISOString();

  const { data: usageLogs = [] } = useQuery({
    queryKey: ['ai-usage-logs', dateRangeDays],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_usage_logs' as any)
        .select('*')
        .gte('created_at', rangeStart)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data as unknown as any[]) || [];
    },
    enabled: isAdmin,
  });

  const totalRequests = usageLogs.length;
  const totalWords = Math.round(usageLogs.reduce((s: number, l: any) => s + (l.total_tokens || 0), 0) * 0.75);
  const totalCost = usageLogs.reduce((s: number, l: any) => s + Number(l.estimated_cost_usd || 0), 0);
  const distinctFeatures = new Set(usageLogs.map((l: any) => l.feature)).size;

  // By-feature bar chart
  const featureCounts: Record<string, number> = {};
  usageLogs.forEach((l: any) => { featureCounts[l.feature] = (featureCounts[l.feature] || 0) + 1; });
  const featureChartData = Object.entries(featureCounts).map(([feature, count]) => ({
    name: FEATURE_NAME_MAP[feature] || feature,
    count,
  }));

  // Daily activity chart
  const dailyCounts: Record<string, number> = {};
  for (let i = dateRangeDays - 1; i >= 0; i--) {
    const key = format(subDays(new Date(), i), 'MMM d');
    dailyCounts[key] = 0;
  }
  usageLogs.forEach((l: any) => {
    const key = format(new Date(l.created_at), 'MMM d');
    if (key in dailyCounts) dailyCounts[key]++;
  });
  const dailyChartData = Object.entries(dailyCounts).map(([date, count]) => ({ date, count }));

  // Model distribution
  const modelCounts: Record<string, number> = {};
  usageLogs.forEach((l: any) => { modelCounts[l.model] = (modelCounts[l.model] || 0) + 1; });

  // Cost by feature
  const featureCosts: Record<string, { requests: number; words: number; cost: number }> = {};
  usageLogs.forEach((l: any) => {
    if (!featureCosts[l.feature]) featureCosts[l.feature] = { requests: 0, words: 0, cost: 0 };
    featureCosts[l.feature].requests++;
    featureCosts[l.feature].words += Math.round((l.total_tokens || 0) * 0.75);
    featureCosts[l.feature].cost += Number(l.estimated_cost_usd || 0);
  });

  const analyzeIdea = async () => {
    if (!ideaText.trim()) { toast.error('Describe your idea first'); return; }
    setAnalyzingIdea(true);
    setIdeaResult(null);
    try {
      const existingTitles = roadmapItems.map(r => r.title);
      const { data, error } = await supabase.functions.invoke('analyze-telemetry', {
        body: { mode: 'idea', raw_idea: ideaText, existing_titles: existingTitles },
      });
      if (error) throw error;
      setIdeaResult(data);
    } catch {
      toast.error('AI analysis failed');
    } finally {
      setAnalyzingIdea(false);
    }
  };

  const addIdeaToRoadmap = async () => {
    if (!ideaResult) return;
    await addItem.mutateAsync({
      title: ideaResult.title,
      description: ideaResult.description,
      category: ideaResult.category,
      priority: ideaResult.priority,
      status: 'backlog',
      ai_tested: true,
      ai_evidence: ideaResult.evidence,
      ai_challenges: ideaResult.challenges,
      ai_duplicate_warning: ideaResult.duplicate_warning || null,
    });
    setIdeaText('');
    setIdeaResult(null);
  };

  const scanTelemetry = async () => {
    setScanningTelemetry(true);
    setTelemetryGaps([]);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-telemetry', {
        body: { mode: 'telemetry' },
      });
      if (error) throw error;
      setTelemetryGaps(data.gaps || []);
      toast.success(`Found ${data.gaps?.length || 0} UX gap${data.gaps?.length !== 1 ? 's' : ''}`);
    } catch {
      toast.error('Telemetry scan failed');
    } finally {
      setScanningTelemetry(false);
    }
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const itemsForColumn = (col: string) => roadmapItems.filter(i => i.status === col);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/40 sticky top-0 z-50 bg-background/90 backdrop-blur-md">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <Shield className="h-6 w-6 text-primary" />
            <span className="font-display text-xl tracking-tight">BinCheck<span className="text-primary">NYC</span></span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/dd-reports')}>
              DD Reports
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>
              <Shield className="h-4 w-4 mr-1" /> Admin
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 max-w-6xl space-y-6">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <div>
            <h1 className="font-display text-2xl font-bold">Help Center</h1>
            <p className="text-muted-foreground text-sm">Product roadmap, feature research, and AI usage insights.</p>
          </div>
        </div>

        <Tabs defaultValue="roadmap">
          <TabsList>
            <TabsTrigger value="roadmap">
              <TrendingUp className="h-4 w-4 mr-1.5" /> Product Roadmap
            </TabsTrigger>
            <TabsTrigger value="requests">
              <Brain className="h-4 w-4 mr-1.5" /> Feature Requests
            </TabsTrigger>
            <TabsTrigger value="usage">
              <BarChart3 className="h-4 w-4 mr-1.5" /> AI Usage
            </TabsTrigger>
          </TabsList>

          {/* ══ TAB 1: PRODUCT ROADMAP ══════════════════════════════════════ */}
          <TabsContent value="roadmap" className="mt-6">
            {loadingRoadmap ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {COLUMNS.map(col => (
                  <div key={col} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">{COLUMN_LABELS[col]}</h3>
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                        {itemsForColumn(col).length}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {itemsForColumn(col).map(item => (
                        <RoadmapCard
                          key={item.id}
                          item={item}
                          onMove={(id, status) => moveItem.mutate({ id, status })}
                          onDelete={(id) => deleteItem.mutate(id)}
                          onRunTest={runItemTest}
                          isTestingId={testingItemId}
                        />
                      ))}
                      {itemsForColumn(col).length === 0 && (
                        <div className="text-center py-8 text-muted-foreground text-xs border border-dashed rounded-lg">
                          No items
                        </div>
                      )}
                    </div>
                    {col === 'backlog' && (
                      <AddItemForm
                        onAdd={(item) => addItem.mutate(item)}
                        existingTitles={roadmapItems.map(r => r.title)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ══ TAB 2: FEATURE REQUESTS ═════════════════════════════════════ */}
          <TabsContent value="requests" className="mt-6 space-y-8">
            {/* AI Idea Intake */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: input */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" /> Got an idea?
                  </CardTitle>
                  <CardDescription>Describe a feature and AI will stress-test it for you.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    placeholder="Describe your feature idea..."
                    value={ideaText}
                    onChange={e => setIdeaText(e.target.value)}
                    className="min-h-[120px]"
                  />
                  <Button className="w-full" onClick={analyzeIdea} disabled={analyzingIdea}>
                    {analyzingIdea ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing…</>
                    ) : (
                      <><Zap className="h-4 w-4 mr-2" /> Analyze with AI</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Right: result */}
              <Card className={ideaResult ? '' : 'border-dashed opacity-60'}>
                <CardHeader>
                  <CardTitle className="text-base">AI Analysis</CardTitle>
                  <CardDescription>Refined title, priority, and challenges.</CardDescription>
                </CardHeader>
                <CardContent>
                  {!ideaResult ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      Results appear here after analysis.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <p className="font-semibold text-base">{ideaResult.title}</p>
                        <p className="text-sm text-muted-foreground mt-1">{ideaResult.description}</p>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium ${PRIORITY_STYLES[ideaResult.priority] || PRIORITY_STYLES.medium}`}>
                          {ideaResult.priority} priority
                        </span>
                        <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium ${CATEGORY_STYLES[ideaResult.category] || CATEGORY_STYLES.general}`}>
                          {ideaResult.category}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold mb-1">Why it matters</p>
                        <p className="text-xs text-muted-foreground">{ideaResult.evidence}</p>
                      </div>
                      {ideaResult.challenges.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold mb-2">Challenges</p>
                          <div className="space-y-1.5">
                            {ideaResult.challenges.map((c, i) => (
                              <div key={i} className="text-xs">
                                <span className="text-destructive font-medium">{c.problem}</span>
                                <span className="mx-1 text-muted-foreground">→</span>
                                <span className="text-emerald-600">{c.solution}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {ideaResult.duplicate_warning && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2 text-amber-700 text-xs">
                          ⚠️ {ideaResult.duplicate_warning}
                        </div>
                      )}
                      <Button className="w-full" size="sm" onClick={addIdeaToRoadmap} disabled={addItem.isPending}>
                        {addItem.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                        Add to Roadmap
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Separator />

            {/* Telemetry Scan */}
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">UX Funnel Analysis</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Scan order submission data to find where clients drop off or struggle.
                  </p>
                </div>
                <Button onClick={scanTelemetry} disabled={scanningTelemetry} variant="outline">
                  {scanningTelemetry ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning…</>
                  ) : (
                    <><Search className="h-4 w-4 mr-2" /> Scan for UX Gaps</>
                  )}
                </Button>
              </div>

              {telemetryGaps.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {telemetryGaps.map((gap, i) => (
                    <Card key={i} className="border">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start gap-2">
                          <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 mt-0.5 ${PRIORITY_STYLES[gap.priority] || PRIORITY_STYLES.medium}`}>
                            {gap.priority}
                          </span>
                          <p className="font-semibold text-sm">{gap.title}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{gap.description}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => addItem.mutate({
                            title: gap.title,
                            description: gap.description,
                            category: 'operations',
                            priority: gap.priority,
                            status: 'backlog',
                            ai_tested: true,
                            ai_evidence: gap.description,
                            ai_challenges: null,
                            ai_duplicate_warning: null,
                          })}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add to Roadmap
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ══ TAB 3: AI USAGE ═════════════════════════════════════════════ */}
          <TabsContent value="usage" className="mt-6 space-y-6">
            {/* Date range selector */}
            <div className="flex items-center gap-2">
              {DATE_RANGES.map(r => (
                <Button
                  key={r.days}
                  variant={dateRangeDays === r.days ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDateRangeDays(r.days)}
                >
                  {r.label}
                </Button>
              ))}
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6 pb-5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Activity className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-display font-bold">{totalRequests}</p>
                    <p className="text-xs text-muted-foreground">Total Requests</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 pb-5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Brain className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-display font-bold">{totalWords >= 1000 ? `${(totalWords / 1000).toFixed(1)}k` : totalWords}</p>
                    <p className="text-xs text-muted-foreground">Words Processed</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 pb-5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <DollarSign className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-display font-bold">${totalCost.toFixed(4)}</p>
                    <p className="text-xs text-muted-foreground">Estimated Cost</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 pb-5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Zap className="h-4 w-4 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-display font-bold">{distinctFeatures}</p>
                    <p className="text-xs text-muted-foreground">Features Using AI</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Requests by Feature</CardTitle>
                </CardHeader>
                <CardContent>
                  {featureChartData.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No data in this range.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={featureChartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip
                          formatter={(v) => [`${v} requests`, 'Count']}
                          contentStyle={{ fontSize: 12 }}
                        />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Daily AI Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  {totalRequests === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No activity in this range.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={dailyChartData.slice(-14)}> {/* show last 14 days */}
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip
                          formatter={(v) => [`${v} requests`, 'Requests']}
                          contentStyle={{ fontSize: 12 }}
                        />
                        <Bar dataKey="count" fill="hsl(var(--primary) / 0.7)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Models used */}
            {Object.keys(modelCounts).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">AI Models Used</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(modelCounts).map(([model, count]) => (
                    <div key={model} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-foreground font-medium">{MODEL_NAME_MAP[model] || model}</span>
                        <span className="text-muted-foreground">{count} / {totalRequests} ({totalRequests > 0 ? Math.round(count / totalRequests * 100) : 0}%)</span>
                      </div>
                      <Progress value={totalRequests > 0 ? count / totalRequests * 100 : 0} className="h-2" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Cost breakdown table */}
            {Object.keys(featureCosts).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Cost Breakdown by Feature</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="pb-2 text-xs font-medium text-muted-foreground">Feature</th>
                          <th className="pb-2 text-xs font-medium text-muted-foreground text-right">Requests</th>
                          <th className="pb-2 text-xs font-medium text-muted-foreground text-right">Words Processed</th>
                          <th className="pb-2 text-xs font-medium text-muted-foreground text-right">Est. Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {Object.entries(featureCosts).map(([feature, stats]) => (
                          <tr key={feature}>
                            <td className="py-2 text-xs">{FEATURE_NAME_MAP[feature] || feature}</td>
                            <td className="py-2 text-xs text-right text-muted-foreground">{stats.requests}</td>
                            <td className="py-2 text-xs text-right text-muted-foreground">{stats.words.toLocaleString()}</td>
                            <td className="py-2 text-xs text-right">${stats.cost.toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    Words processed is an estimate (tokens × 0.75). For actual billing, see{' '}
                    <a href="https://lovable.dev/pricing" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      Lovable Billing
                    </a>.
                  </p>
                </CardContent>
              </Card>
            )}

            {totalRequests === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Brain className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p className="font-medium">No AI usage recorded in this time range.</p>
                <p className="text-sm mt-1">Generate a report or run an AI stress test to see data here.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Help;
