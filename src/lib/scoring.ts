import { PropertyData, ComplianceScore, CategoryScore } from "@/types/property";

/**
 * Severe property flags that should override the headline risk score.
 * These come from DOB BIS complaint disposition codes (decoded in the
 * edge function) and are passed in alongside PropertyData.
 */
export interface PropertyFlags {
  vacate_order?: boolean;
  stop_work_order?: boolean;
  unsafe_building?: boolean;
  closure_order?: boolean;
  emergency_declaration?: boolean;
  compromised_structure?: boolean;
  vacant_structure?: boolean;
  /**
   * Total outstanding DOF charges (property tax, sidewalk assessment, emergency
   * repair, etc.) in USD. Passed from dofCharges.totals.outstanding so the
   * headline score cannot read "LOW RISK" while a six-figure DOF balance sits
   * unpaid — the bug that made the 1221 Fteley report look broken.
   */
  dof_outstanding?: number;
}

export interface ScoreOverride {
  applied: boolean;
  reason?: string;
  capAt?: number;
}

export function calculateComplianceScore(
  data: PropertyData,
  flags: PropertyFlags = {}
): ComplianceScore {
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
  let overall = Math.round(
    hpdScore.score * 0.35 + dobScore.score * 0.30 + ecbScore.score * 0.20 + oathScore.score * 0.15
  );

  // ---- Override rules (severity-first) ----
  // Any open ECB penalty bucket cannot be hidden behind weighted averaging.
  const activeECB = safeData.ecbViolations.filter(v =>
    v.status?.toLowerCase() !== 'resolved' && v.status?.toLowerCase() !== 'closed'
  );
  const totalECBPenalty = activeECB.reduce(
    (sum, v) => sum + (parseFloat(v.penalty_balance_due || '0') || 0),
    0
  );
  const maxECBPenalty = activeECB.reduce(
    (max, v) => Math.max(max, parseFloat(v.penalty_balance_due || '0') || 0),
    0
  );

  const overrides: string[] = [];

  // Critical property flags (Vacate / SWO / Unsafe / Closure) — cap at 40 (High Risk)
  if (
    flags.vacate_order ||
    flags.stop_work_order ||
    flags.unsafe_building ||
    flags.closure_order
  ) {
    if (overall > 40) {
      overall = 40;
      if (flags.vacate_order) overrides.push('Vacate Order active');
      if (flags.stop_work_order) overrides.push('Stop Work Order active');
      if (flags.unsafe_building) overrides.push('Unsafe Building declared');
      if (flags.closure_order) overrides.push('Closure/Padlock Order active');
    }
  }

  // Total open ECB > $5,000 — cap at 55 (Elevated)
  if (totalECBPenalty > 5000 && overall > 55) {
    overall = 55;
    overrides.push(`$${Math.round(totalECBPenalty).toLocaleString()} in unpaid ECB penalties`);
  }

  // Any single open ECB > $1,000 — cap at 70 (Moderate)
  if (maxECBPenalty > 1000 && overall > 70) {
    overall = 70;
    overrides.push(`Open ECB violation with $${Math.round(maxECBPenalty).toLocaleString()} unpaid`);
  }

  // ---- DOF outstanding-charges overrides ----
  // Property tax / sidewalk assessment / emergency repair charges create lien
  // risk at closing and must be reflected in the headline score regardless of
  // how clean the violation record looks.
  const dofOutstanding = flags.dof_outstanding || 0;
  if (dofOutstanding > 100000 && overall > 40) {
    overall = 40;
    overrides.push(`$${Math.round(dofOutstanding).toLocaleString()} in unpaid DOF charges (lien risk)`);
  } else if (dofOutstanding > 25000 && overall > 55) {
    overall = 55;
    overrides.push(`$${Math.round(dofOutstanding).toLocaleString()} in unpaid DOF charges`);
  } else if (dofOutstanding > 5000 && overall > 70) {
    overall = 70;
    overrides.push(`$${Math.round(dofOutstanding).toLocaleString()} in unpaid DOF charges`);
  }

  const riskLevel: 'low' | 'medium' | 'high' =
    overall >= 80 ? 'low' : overall >= 50 ? 'medium' : 'high';
  const color = overall >= 80 ? 'green' : overall >= 50 ? 'yellow' : 'red';

  return {
    overall,
    categories: [dobScore, ecbScore, hpdScore, oathScore],
    riskLevel,
    color,
    // Surfaced for the UI/report — non-breaking optional field
    ...(overrides.length > 0 && { overrideReasons: overrides }),
  } as ComplianceScore;
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
