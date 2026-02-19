import { ComplianceScore } from "@/types/property";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getScoreColor, getScoreBgColor, getRiskLabel } from "@/lib/scoring";
import { Shield } from "lucide-react";

interface ScoreCardProps {
  score: ComplianceScore;
}

export function ScoreCard({ score }: ScoreCardProps) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4 text-primary" />
          Compliance Score
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Main score */}
        <div className="text-center">
          <div className={`text-6xl font-display font-bold ${getScoreColor(score.overall)}`}>
            {score.overall}
          </div>
          <p className={`text-sm font-semibold mt-1 ${getScoreColor(score.overall)}`}>
            {getRiskLabel(score.riskLevel)}
          </p>
        </div>

        {/* Score gauge */}
        <div className="w-full h-3 rounded-full bg-secondary overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${getScoreBgColor(score.overall)}`}
            style={{ width: `${score.overall}%` }}
          />
        </div>

        {/* Category breakdown */}
        <div className="space-y-3">
          {score.categories.map((cat) => (
            <div key={cat.category} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{cat.category}</span>
                <span className={`font-mono font-semibold ${getScoreColor(cat.score)}`}>{cat.score}</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full ${getScoreBgColor(cat.score)}`}
                  style={{ width: `${cat.score}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{cat.details}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
