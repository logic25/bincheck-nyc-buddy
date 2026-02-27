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

    // Get all approved edits
    const { data: allEdits } = await supabase
      .from("report_edits")
      .select("agency, item_type, item_identifier, error_category, edited_note")
      .eq("status", "approved");

    const edits = allEdits || [];

    // Get total notes generated from dd_reports
    const { data: reports } = await supabase
      .from("dd_reports")
      .select("violations_data, applications_data, line_item_notes")
      .not("line_item_notes", "is", null);

    // Count total notes by agency/item_type
    const noteCounts: Record<string, number> = {};
    for (const report of reports || []) {
      const notes = report.line_item_notes || [];
      if (!Array.isArray(notes)) continue;
      for (const note of notes) {
        // Try to determine agency from violations/applications data
        const agency = inferAgencyFromNote(note, report.violations_data, report.applications_data);
        const key = `${agency}::${note.item_type || "unknown"}`;
        noteCounts[key] = (noteCounts[key] || 0) + 1;
      }
    }

    // Group edits by agency + item_type + violation_type
    const editGroups: Record<string, { count: number; categories: Record<string, number>; violationType: string }> = {};
    for (const edit of edits) {
      const violationType = inferViolationType(edit.item_identifier, edit.edited_note);
      const key = `${edit.agency}::${edit.item_type}::${violationType}`;
      if (!editGroups[key]) {
        editGroups[key] = { count: 0, categories: {}, violationType };
      }
      editGroups[key].count++;
      editGroups[key].categories[edit.error_category] = (editGroups[key].categories[edit.error_category] || 0) + 1;
    }

    // Upsert accuracy stats
    const now = new Date().toISOString();
    let upsertCount = 0;

    for (const [key, group] of Object.entries(editGroups)) {
      const [agency, itemType, violationType] = key.split("::");
      const noteKey = `${agency}::${itemType}`;
      const totalGenerated = noteCounts[noteKey] || group.count; // fallback to edit count if we can't determine total
      const editRate = totalGenerated > 0 ? group.count / totalGenerated : 0;

      // Find top error category
      const topCategory = Object.entries(group.categories)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      // Upsert: try update first, then insert
      const { data: existing } = await supabase
        .from("ai_accuracy_stats")
        .select("id")
        .eq("agency", agency)
        .eq("item_type", itemType)
        .eq("violation_type", violationType === "general" ? "" : violationType)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("ai_accuracy_stats")
          .update({
            total_notes_generated: totalGenerated,
            total_edits: group.count,
            edit_rate: Math.round(editRate * 1000) / 1000,
            top_error_category: topCategory,
            last_updated: now,
          })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("ai_accuracy_stats")
          .insert({
            agency,
            item_type: itemType,
            violation_type: violationType === "general" ? null : violationType,
            total_notes_generated: totalGenerated,
            total_edits: group.count,
            edit_rate: Math.round(editRate * 1000) / 1000,
            top_error_category: topCategory,
            last_updated: now,
          });
      }
      upsertCount++;
    }

    // Trigger knowledge gap detection
    const gapResponse = await fetch(`${supabaseUrl}/functions/v1/detect-knowledge-gaps`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    let gapResult = null;
    if (gapResponse.ok) {
      gapResult = await gapResponse.json();
    } else {
      const errText = await gapResponse.text();
      console.error("Gap detection error:", errText);
    }

    return new Response(
      JSON.stringify({
        stats_updated: upsertCount,
        total_edits_processed: edits.length,
        gap_detection: gapResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("refresh-accuracy-stats error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function inferAgencyFromNote(note: any, violations: any, applications: any): string {
  const itemId = note.item_id || "";
  // Check violations
  if (Array.isArray(violations)) {
    const match = violations.find((v: any) => v.id === itemId || v.violation_number === itemId);
    if (match) return match.agency || "UNKNOWN";
  }
  // Check applications
  if (Array.isArray(applications)) {
    const match = applications.find((a: any) => {
      const appKey = `${a.source || 'BIS'}-${a.id || a.application_number}`;
      return appKey === itemId;
    });
    if (match) return match.source === "DOB_NOW" ? "DOB" : "DOB";
  }
  return "UNKNOWN";
}

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
    ["zoning", /zoning|certificate of occupancy/],
    ["lead_paint", /lead|paint/],
  ];
  for (const [type, regex] of patterns) {
    if (regex.test(combined)) return type;
  }
  return "general";
}
