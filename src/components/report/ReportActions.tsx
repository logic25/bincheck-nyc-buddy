import { useState } from "react";
import { PropertyData, ComplianceScore } from "@/types/property";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface ReportActionsProps {
  data: PropertyData;
  score: ComplianceScore;
}

export function ReportActions({ data, score }: ReportActionsProps) {
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const handleSave = async () => {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user) {
      toast.info("Sign in to save reports", { action: { label: "Sign In", onClick: () => navigate("/auth") } });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("saved_reports").insert({
        user_id: session.session.user.id,
        bin: data.bin,
        address: data.address,
        report_data: JSON.parse(JSON.stringify(data)),
        compliance_score: score.overall,
        risk_level: score.riskLevel,
      });
      if (error) throw error;
      toast.success("Report saved!");
    } catch (e: any) {
      toast.error("Failed to save: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExportPDF = async () => {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user) {
      toast.info("Sign in to export PDFs", { action: { label: "Sign In", onClick: () => navigate("/auth") } });
      return;
    }
    // PDF export will be implemented with client-side generation
    toast.info("PDF export coming soon!");
  };

  return (
    <Card className="border-border bg-card h-full">
      <CardContent className="p-6 flex flex-col justify-center h-full gap-3">
        <p className="text-sm text-muted-foreground mb-2">
          Save this search or export as PDF to share with your transaction team.
        </p>
        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Report
        </Button>
        <Button onClick={handleExportPDF} variant="outline" className="w-full">
          <Download className="h-4 w-4 mr-2" />
          Export PDF
        </Button>
      </CardContent>
    </Card>
  );
}
