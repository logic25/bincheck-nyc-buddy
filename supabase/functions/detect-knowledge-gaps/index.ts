import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  'https://binchecknyc.com',
  'https://id-preview--5687520e-43de-4827-98f8-73a2100ce635.lovable.app',
  'http://localhost:5173',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get approved edits from last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentEdits } = await supabase
      .from("report_edits")
      .select("*")
      .eq("status", "approved")
      .gte("created_at", thirtyDaysAgo);

    const edits = recentEdits || [];
    if (edits.length === 0) {
      return new Response(JSON.stringify({ candidates_created: 0, message: "No recent approved edits" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by agency + error_category
    const groups: Record<string, { count: number; editIds: string[]; agencies: Set<string>; violationTypes: Set<string> }> = {};
    for (const edit of edits) {
      // Extract violation_type from item_identifier heuristics
      const violationType = inferViolationType(edit.item_identifier, edit.edited_note);
      const key = `${edit.agency}::${edit.error_category}::${violationType}`;
      if (!groups[key]) {
        groups[key] = { count: 0, editIds: [], agencies: new Set(), violationTypes: new Set() };
      }
      groups[key].count++;
      groups[key].editIds.push(edit.id);
      groups[key].agencies.add(edit.agency);
      if (violationType !== "general") groups[key].violationTypes.add(violationType);
    }

    // Check thresholds
    const gapThresholds: Record<string, number> = {
      knowledge_gap: 3,
      wrong_agency_explanation: 5,
      factual_error: 3,
    };

    // Also check accuracy stats for high edit rates
    const { data: stats } = await supabase
      .from("ai_accuracy_stats")
      .select("*")
      .gt("edit_rate", 0.4);

    const highEditRateCombos = new Set(
      (stats || []).map((s: any) => `${s.agency}::${s.violation_type || "general"}`)
    );

    // Get existing candidates to avoid duplicates
    const { data: existingCandidates } = await supabase
      .from("knowledge_candidates")
      .select("agency, violation_types, status")
      .in("status", ["detected", "drafted", "approved", "active"]);

    const existingKeys = new Set(
      (existingCandidates || []).map((c: any) => {
        const types = (c.violation_types || []).sort().join(",");
        return `${c.agency}::${types}`;
      })
    );

    const newCandidates: any[] = [];

    for (const [key, group] of Object.entries(groups)) {
      const [agency, errorCategory, violationType] = key.split("::");
      const threshold = gapThresholds[errorCategory];
      const meetsThreshold = (threshold && group.count >= threshold) ||
        highEditRateCombos.has(`${agency}::${violationType}`);

      if (!meetsThreshold) continue;

      const vTypes = Array.from(group.violationTypes);
      const candidateKey = `${agency}::${vTypes.sort().join(",")}`;
      if (existingKeys.has(candidateKey)) continue;

      // Determine priority
      const editRate = group.count / Math.max(edits.length, 1);
      let priority = "medium";
      if (editRate > 0.5 || group.count >= 10) priority = "critical";
      else if (editRate > 0.4 || group.count >= 7) priority = "high";

      // Determine knowledge_type
      let knowledgeType = "violation_guide";
      if (errorCategory === "wrong_agency_explanation") knowledgeType = "agency_explainer";
      else if (errorCategory === "factual_error") knowledgeType = "regulation_reference";

      const title = buildTitle(agency, vTypes, errorCategory);

      const candidate = {
        title,
        knowledge_type: knowledgeType,
        agency,
        violation_types: vTypes,
        trigger_reason: `${group.count} corrections in 30 days, primarily ${errorCategory.replace(/_/g, " ")}`,
        source_edit_ids: group.editIds.slice(0, 20),
        demand_score: group.count,
        priority,
        status: "detected",
      };

      const { data: inserted, error } = await supabase
        .from("knowledge_candidates")
        .insert(candidate)
        .select()
        .single();

      if (!error && inserted) {
        newCandidates.push(inserted);
        existingKeys.add(candidateKey);
      }
    }

    return new Response(
      JSON.stringify({ candidates_created: newCandidates.length, candidates: newCandidates }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("detect-knowledge-gaps error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function inferViolationType(identifier: string, note: string): string {
  const combined = `${identifier} ${note}`.toLowerCase();
  const patterns: [string, RegExp][] = [
    ["elevator", /elevator|lift/],
    ["facade", /facade|local law 11|ll11|exterior wall/],
    ["sprinkler", /sprinkler|standpipe/],
    ["boiler", /boiler/],
    ["electrical", /electric|wiring/],
    ["plumbing", /plumb/],
    ["fire_safety", /fire|smoke|alarm|fdny/],
    ["construction", /construction|build|demolition/],
    ["zoning", /zoning|certificate of occupancy|c of o/],
    ["lead_paint", /lead|paint/],
  ];
  for (const [type, regex] of patterns) {
    if (regex.test(combined)) return type;
  }
  return "general";
}

function buildTitle(agency: string, violationTypes: string[], errorCategory: string): string {
  const typeStr = violationTypes.length > 0
    ? violationTypes.map(t => t.replace(/_/g, " ")).join(" & ")
    : "general items";

  const actionMap: Record<string, string> = {
    knowledge_gap: "Assessment Guide",
    wrong_agency_explanation: "Agency Explanation Reference",
    factual_error: "Regulation Fact Sheet",
    too_vague: "Specificity Guide",
    missing_context: "Context Guidelines",
  };
  const action = actionMap[errorCategory] || "Reference Guide";
  return `${agency} ${typeStr.charAt(0).toUpperCase() + typeStr.slice(1)} ${action}`;
}
