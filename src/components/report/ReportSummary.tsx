import { PropertyData, ComplianceScore } from "@/types/property";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getScoreColor } from "@/lib/scoring";
import { BarChart3 } from "lucide-react";

interface ReportSummaryProps {
  data: PropertyData;
  score: ComplianceScore;
}

export function ReportSummary({ data, score }: ReportSummaryProps) {
  const activeDOB = data.dobViolations.filter(v => v.status?.toLowerCase() !== 'closed').length;
  const activeECB = data.ecbViolations.filter(v => v.status?.toLowerCase() !== 'resolved' && v.status?.toLowerCase() !== 'closed').length;
  const activeHPD = data.hpdViolations.filter(v => v.violationstatus?.toLowerCase() !== 'close').length;
  const activeOATH = (data.oathViolations || []).filter(v => v.status?.toLowerCase() !== 'closed').length;
  const totalActive = activeDOB + activeECB + activeHPD + activeOATH;
  const totalAll = data.dobViolations.length + data.ecbViolations.length + data.hpdViolations.length + (data.oathViolations || []).length;
  const totalClosed = totalAll - totalActive;

  const riskFlags: string[] = [];
  const classCCount = data.hpdViolations.filter(v => v.class === 'C' && v.violationstatus?.toLowerCase() !== 'close').length;
  if (classCCount > 0) riskFlags.push(`${classCCount} active HPD Class C violation${classCCount > 1 ? 's' : ''}`);
  if (activeDOB > 5) riskFlags.push(`High volume of active DOB violations (${activeDOB})`);
  const totalPenalty = data.ecbViolations.reduce((sum, v) => sum + (parseFloat(v.penalty_balance_due || '0') || 0), 0);
  if (totalPenalty > 5000) riskFlags.push(`$${totalPenalty.toLocaleString()} in ECB penalties`);
  if (activeOATH > 3) riskFlags.push(`${activeOATH} open OATH agency violations`);
  const complaints = data.dobComplaints || [];
  if (complaints.length > 0) riskFlags.push(`${complaints.length} DOB complaint${complaints.length > 1 ? 's' : ''} on record`);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-primary" />
          Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-2xl font-display font-bold text-destructive">{totalActive}</p>
            <p className="text-xs text-muted-foreground">Open Violations</p>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-display font-bold text-muted-foreground">{totalClosed}</p>
            <p className="text-xs text-muted-foreground">Closed Violations</p>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-display font-bold text-foreground">{data.permits.length}</p>
            <p className="text-xs text-muted-foreground">Permits/Applications</p>
          </div>
          <div className="space-y-1">
            <p className={`text-2xl font-display font-bold ${getScoreColor(score.overall)}`}>{score.overall}/100</p>
            <p className="text-xs text-muted-foreground">Compliance Score</p>
          </div>
        </div>
        {riskFlags.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border space-y-1">
            <p className="text-sm font-semibold text-destructive">⚠ Risk Flags</p>
            {riskFlags.map((flag, i) => (
              <p key={i} className="text-sm text-muted-foreground">• {flag}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
