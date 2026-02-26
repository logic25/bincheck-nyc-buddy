import { PropertyData, ComplianceScore, CategoryScore } from "@/types/property";

export function calculateComplianceScore(data: PropertyData): ComplianceScore {
  const safeData: PropertyData = {
    ...data,
    dobViolations: data.dobViolations || [],
    ecbViolations: data.ecbViolations || [],
    hpdViolations: data.hpdViolations || [],
    oathViolations: data.oathViolations || [],
    dobComplaints: data.dobComplaints || [],
    permits: data.permits || [],
  };
  const dobScore = calculateDOBScore(safeData);
  const ecbScore = calculateECBScore(safeData);
  const hpdScore = calculateHPDScore(safeData);
  const oathScore = calculateOATHScore(safeData);

  // Weights: HPD=0.35, DOB=0.30, ECB=0.20, OATH=0.15
  const overall = Math.round(
    hpdScore.score * 0.35 + dobScore.score * 0.30 + ecbScore.score * 0.20 + oathScore.score * 0.15
  );

  const riskLevel = overall >= 80 ? 'low' : overall >= 50 ? 'medium' : 'high';
  const color = overall >= 80 ? 'green' : overall >= 50 ? 'yellow' : 'red';

  return {
    overall,
    categories: [dobScore, ecbScore, hpdScore, oathScore],
    riskLevel,
    color,
  };
}

function calculateDOBScore(data: PropertyData): CategoryScore {
  const active = data.dobViolations.filter(v =>
    v.status?.toLowerCase() !== 'closed' && v.status?.toLowerCase() !== 'resolved'
  );
  let score = 100;
  score -= active.length * 5;
  score = Math.max(0, Math.min(100, score));

  return {
    category: 'DOB',
    score,
    weight: 0.30,
    details: `${active.length} active violation${active.length !== 1 ? 's' : ''} of ${data.dobViolations.length} total`,
  };
}

function calculateECBScore(data: PropertyData): CategoryScore {
  const active = data.ecbViolations.filter(v =>
    v.status?.toLowerCase() !== 'resolved' && v.status?.toLowerCase() !== 'closed'
  );
  let totalPenalty = 0;
  active.forEach(v => {
    totalPenalty += parseFloat(v.penalty_balance_due || '0') || 0;
  });
  let score = 100;
  score -= active.length * 4;
  score -= Math.min(30, totalPenalty / 1000);
  score = Math.max(0, Math.min(100, score));

  return {
    category: 'ECB',
    score: Math.round(score),
    weight: 0.20,
    details: `${active.length} active, $${totalPenalty.toLocaleString()} in penalties`,
  };
}

function calculateHPDScore(data: PropertyData): CategoryScore {
  const active = data.hpdViolations.filter(v =>
    v.violationstatus?.toLowerCase() !== 'close'
  );
  const classC = active.filter(v => v.class === 'C').length;
  const classB = active.filter(v => v.class === 'B').length;
  const classA = active.filter(v => v.class === 'A').length;

  let score = 100;
  score -= classC * 10;
  score -= classB * 5;
  score -= classA * 2;
  score = Math.max(0, Math.min(100, score));

  return {
    category: 'HPD',
    score,
    weight: 0.35,
    details: `Class C: ${classC}, Class B: ${classB}, Class A: ${classA}`,
  };
}

function calculateOATHScore(data: PropertyData): CategoryScore {
  const active = (data.oathViolations || []).filter(v =>
    v.status?.toLowerCase() !== 'closed'
  );
  let totalPenalty = 0;
  active.forEach(v => {
    totalPenalty += parseFloat(v.penalty_imposed || '0') || 0;
  });
  let score = 100;
  score -= active.length * 5;
  score -= Math.min(20, totalPenalty / 2000);
  score = Math.max(0, Math.min(100, score));

  return {
    category: 'OATH',
    score: Math.round(score),
    weight: 0.15,
    details: `${active.length} open across FDNY/DEP/DOT/DSNY/LPC/DOF, $${totalPenalty.toLocaleString()} in penalties`,
  };
}

export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-score-green';
  if (score >= 50) return 'text-score-yellow';
  return 'text-score-red';
}

export function getScoreBgColor(score: number): string {
  if (score >= 80) return 'bg-score-green';
  if (score >= 50) return 'bg-score-yellow';
  return 'bg-score-red';
}

export function getRiskLabel(level: string): string {
  switch (level) {
    case 'low': return 'Low Risk';
    case 'medium': return 'Medium Risk';
    case 'high': return 'High Risk';
    default: return 'Unknown';
  }
}
