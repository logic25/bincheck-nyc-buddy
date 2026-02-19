import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, ArrowLeft, LogOut, RefreshCw, Loader2, Trash2 } from "lucide-react";
import { getScoreColor } from "@/lib/scoring";
import { toast } from "sonner";

interface ReportRow {
  id: string;
  bin: string;
  address: string;
  compliance_score: number;
  risk_level: string;
  created_at: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate("/auth");
        return;
      }
      fetchReports();
    };
    check();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("saved_reports")
      .select("id, bin, address, compliance_score, risk_level, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load reports");
    } else {
      setReports(data || []);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("saved_reports").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete");
    } else {
      setReports(r => r.filter(rep => rep.id !== id));
      toast.success("Report deleted");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <Shield className="h-6 w-6 text-primary" />
            <span className="font-display text-xl font-bold tracking-tight">BinCheck<span className="text-primary">NYC</span></span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Search
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-1" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold">Saved Reports</h1>
          <Button variant="outline" size="sm" onClick={fetchReports}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : reports.length === 0 ? (
          <Card className="border-border bg-card">
            <CardContent className="py-16 text-center">
              <p className="text-muted-foreground">No saved reports yet. Search a property and save the report!</p>
              <Button className="mt-4" onClick={() => navigate("/")}>Search Properties</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <Card key={r.id} className="border-border bg-card hover:bg-card/80 transition-colors cursor-pointer" onClick={() => navigate(`/report?bin=${r.bin}`)}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-semibold">{r.address || "Unknown"}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">BIN: {r.bin}</span>
                      <span>•</span>
                      <span>{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={`text-xl font-display font-bold ${getScoreColor(r.compliance_score)}`}>{r.compliance_score}</p>
                      <Badge variant={r.risk_level === 'low' ? 'secondary' : r.risk_level === 'high' ? 'destructive' : 'outline'} className="text-xs">
                        {r.risk_level}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
