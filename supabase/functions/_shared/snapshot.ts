// =============================================================================
// NYC Compliance Plant — snapshot helpers
// =============================================================================
// Phase 0 substrate. Imported by generate-dd-report/index.ts at the end of a
// report generation flow to write a per-BIN snapshot, and re-used in Phase 1
// by CitiSignal for diff-based monitoring.
//
// Designed to be additive and non-fatal: a failed snapshot write must never
// fail the parent report generation.
// =============================================================================

export type SourceTag =
  | "socrata"
  | "bis_live"
  | "dobnow_live"
  | "ptaps_live"
  | "cis_live"
  | "acris_cache"
  | "manual";

export interface SourceProvenance {
  source: SourceTag;
  fetched_at: string; // ISO 8601
  confidence: number; // 0.00 - 1.00
  count?: number;     // for list-style data
  balance?: number;   // for monetary data (DOF, DEP)
  note?: string;      // free-form (e.g. "fell back to socrata after live timeout")
}

export interface ComplianceSnapshotData {
  violations: unknown[];
  ecb: unknown[];
  hpd_violations: unknown[];
  fdny_violations: unknown[];
  permits_open: unknown[];        // BIS jobs still open
  permits_dob_now: unknown[];     // DOB NOW Build records
  tax_status: { balance?: number; delinquent?: boolean; [k: string]: unknown };
  water_status: { balance?: number; [k: string]: unknown };
  active_orders: string[];        // e.g. ["partial_swo_20260201", "vacate_order_20251212"]
  landmarked: boolean;
  sidewalk_violations: unknown[];
}

export interface ComplianceSnapshotRow {
  bin: string;
  bbl: string;
  address: string;
  borough?: string | null;
  sources: Record<string, SourceProvenance>;
  data: ComplianceSnapshotData;
  data_hash: string;
  report_id?: string | null;
  subject_type?: "unit" | "building" | null;
  subject_unit?: string | null;
  scope_of_work?: string | null;
}

// SHA-256 hex of a string. Web Crypto only (Deno-native, no deps).
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Canonical JSON serialization so the hash is stable across writes.
// Sorts object keys recursively. Arrays preserve order intentionally —
// row order in lists like violations IS semantic (preserves report layout).
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys
    .map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k]))
    .join(",") + "}";
}

export async function hashSnapshotData(data: ComplianceSnapshotData): Promise<string> {
  return sha256Hex(canonicalize(data));
}

// Compose the sources object from feature flags + actual fetch metadata.
// Caller passes per-category fetch results (which may have used live or
// socrata fallback) and we tag accordingly.
export interface FetchProvenanceInputs {
  useLiveBIS: boolean;
  useLiveDOF: boolean;
  useLiveDEP: boolean;
  dofFellBackToSocrata?: boolean;
  depFellBackToSocrata?: boolean;
  bisFellBackToSocrata?: boolean;
  fetchedAt: string;
  counts: {
    dob_violations: number;
    ecb_violations: number;
    hpd_violations: number;
    fdny_violations: number;
    bis_jobs: number;
    dob_now_build: number;
    sidewalk_violations: number;
  };
  balances: {
    dof_tax_balance?: number;
    dep_water_balance?: number;
  };
}

export function buildSourceProvenance(
  i: FetchProvenanceInputs,
): Record<string, SourceProvenance> {
  const bisSource: SourceTag = i.useLiveBIS && !i.bisFellBackToSocrata ? "bis_live" : "socrata";
  const dofSource: SourceTag = i.useLiveDOF && !i.dofFellBackToSocrata ? "ptaps_live" : "socrata";
  const depSource: SourceTag = i.useLiveDEP && !i.depFellBackToSocrata ? "cis_live" : "socrata";

  // Confidence model — calibrate over time:
  //   live agency scrape:    0.99 (authoritative, but scraper can break — flag if fallback)
  //   socrata (NYC Open):    0.85 (lag of hours-to-days)
  //   acris_cache:           0.95
  //   manual analyst pull:   1.00
  const conf = (s: SourceTag): number =>
    s === "ptaps_live" || s === "cis_live" || s === "bis_live" || s === "dobnow_live"
      ? 0.99
      : s === "manual" ? 1.0
      : s === "acris_cache" ? 0.95
      : 0.85;

  return {
    dob_violations:  { source: "socrata",  fetched_at: i.fetchedAt, confidence: conf("socrata"),  count: i.counts.dob_violations },
    ecb_violations:  { source: "socrata",  fetched_at: i.fetchedAt, confidence: conf("socrata"),  count: i.counts.ecb_violations },
    hpd_violations:  { source: "socrata",  fetched_at: i.fetchedAt, confidence: conf("socrata"),  count: i.counts.hpd_violations },
    fdny_violations: { source: "socrata",  fetched_at: i.fetchedAt, confidence: conf("socrata"),  count: i.counts.fdny_violations },
    bis_jobs:        { source: bisSource,  fetched_at: i.fetchedAt, confidence: conf(bisSource),  count: i.counts.bis_jobs,
                       note: i.bisFellBackToSocrata ? "live BIS timeout, fell back to socrata" : undefined },
    dob_now_build:   { source: "dobnow_live", fetched_at: i.fetchedAt, confidence: conf("dobnow_live"), count: i.counts.dob_now_build },
    dof_taxes:       { source: dofSource,  fetched_at: i.fetchedAt, confidence: conf(dofSource),
                       balance: i.balances.dof_tax_balance,
                       note: i.dofFellBackToSocrata ? "live DOF timeout, fell back to socrata" : undefined },
    dep_water:       { source: depSource,  fetched_at: i.fetchedAt, confidence: conf(depSource),
                       balance: i.balances.dep_water_balance,
                       note: i.depFellBackToSocrata ? "live DEP timeout, fell back to socrata" : undefined },
    sidewalk:        { source: "socrata",  fetched_at: i.fetchedAt, confidence: conf("socrata"),  count: i.counts.sidewalk_violations },
  };
}

// Extract active building-wide orders from the violations list.
// These flow into the GLE-style "Building Status and Active Restrictions" section.
export function extractActiveOrders(violations: Array<Record<string, unknown>>): string[] {
  const orders: string[] = [];
  for (const v of violations) {
    const desc = String(v.description ?? v.violation_description ?? "").toLowerCase();
    const status = String(v.status ?? v.violation_status ?? "").toLowerCase();
    if (status.includes("active") || status.includes("open")) {
      if (desc.includes("stop work") || desc.includes("swo")) {
        orders.push(`swo_${v.issue_date ?? v.violation_id ?? "unknown"}`);
      } else if (desc.includes("vacate")) {
        orders.push(`vacate_order_${v.issue_date ?? v.violation_id ?? "unknown"}`);
      } else if (desc.includes("partial stop work")) {
        orders.push(`partial_swo_${v.issue_date ?? v.violation_id ?? "unknown"}`);
      }
    }
  }
  return orders;
}

// =============================================================================
// Diff helper — Phase 1 will use this; ships in Phase 0 so it's ready.
// =============================================================================

export interface SnapshotChange {
  kind: "added" | "removed" | "modified";
  category: keyof ComplianceSnapshotData | "tax_status" | "water_status" | "active_orders";
  payload: unknown;
  significance: "high" | "medium" | "low";
}

export interface SnapshotDiff {
  changed: boolean;
  changes: SnapshotChange[];
  prev_as_of?: string;
  curr_as_of?: string;
}

export function diffSnapshots(
  prev: { as_of: string; data_hash: string; data: ComplianceSnapshotData } | null,
  curr: { as_of: string; data_hash: string; data: ComplianceSnapshotData },
): SnapshotDiff {
  // No prior snapshot — entire curr is new
  if (!prev) {
    return {
      changed: true,
      changes: [{ kind: "added", category: "violations", payload: { initial: true }, significance: "high" }],
      curr_as_of: curr.as_of,
    };
  }
  // Identical hash — short-circuit
  if (prev.data_hash === curr.data_hash) {
    return { changed: false, changes: [], prev_as_of: prev.as_of, curr_as_of: curr.as_of };
  }

  const changes: SnapshotChange[] = [];

  // Compare list-style categories by item key
  const listCategories: Array<keyof ComplianceSnapshotData> = [
    "violations", "ecb", "hpd_violations", "fdny_violations",
    "permits_open", "permits_dob_now", "sidewalk_violations",
  ];
  for (const cat of listCategories) {
    const prevItems = (prev.data[cat] as Array<{ id?: string; violation_id?: string }>) ?? [];
    const currItems = (curr.data[cat] as Array<{ id?: string; violation_id?: string }>) ?? [];
    const keyOf = (x: { id?: string; violation_id?: string }) => x.id ?? x.violation_id ?? JSON.stringify(x);
    const prevKeys = new Set(prevItems.map(keyOf));
    const currKeys = new Set(currItems.map(keyOf));

    for (const item of currItems) {
      if (!prevKeys.has(keyOf(item))) {
        changes.push({
          kind: "added",
          category: cat,
          payload: item,
          significance: cat.includes("violation") ? "high" : "medium",
        });
      }
    }
    for (const item of prevItems) {
      if (!currKeys.has(keyOf(item))) {
        changes.push({
          kind: "removed",
          category: cat,
          payload: item,
          significance: cat.includes("violation") ? "high" : "low",
        });
      }
    }
  }

  // Active orders — high significance always
  const prevOrders = new Set(prev.data.active_orders ?? []);
  const currOrders = new Set(curr.data.active_orders ?? []);
  for (const o of currOrders) {
    if (!prevOrders.has(o)) {
      changes.push({ kind: "added", category: "active_orders", payload: o, significance: "high" });
    }
  }
  for (const o of prevOrders) {
    if (!currOrders.has(o)) {
      changes.push({ kind: "removed", category: "active_orders", payload: o, significance: "high" });
    }
  }

  // Tax + water — modified
  if (JSON.stringify(prev.data.tax_status) !== JSON.stringify(curr.data.tax_status)) {
    changes.push({ kind: "modified", category: "tax_status",
                   payload: { prev: prev.data.tax_status, curr: curr.data.tax_status },
                   significance: "medium" });
  }
  if (JSON.stringify(prev.data.water_status) !== JSON.stringify(curr.data.water_status)) {
    changes.push({ kind: "modified", category: "water_status",
                   payload: { prev: prev.data.water_status, curr: curr.data.water_status },
                   significance: "low" });
  }

  return {
    changed: changes.length > 0,
    changes,
    prev_as_of: prev.as_of,
    curr_as_of: curr.as_of,
  };
}
