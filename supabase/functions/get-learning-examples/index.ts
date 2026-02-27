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

    const { agencies = [], violation_types = [] } = await req.json().catch(() => ({}));

    // PART A: Few-Shot Examples from approved edits
    const { data: approvedEdits } = await supabase
      .from("report_edits")
      .select("*")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(200);

    const edits = approvedEdits || [];

    // Group by error_category
    const byCategory: Record<string, typeof edits> = {};
    for (const edit of edits) {
      const cat = edit.error_category;
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(edit);
    }

    // Get accuracy stats to prioritize categories with highest edit rates
    const { data: accuracyStats } = await supabase
      .from("ai_accuracy_stats")
      .select("*")
      .order("edit_rate", { ascending: false });

    const highEditRateCategories = new Set(
      (accuracyStats || [])
        .filter((s: any) => s.edit_rate > 0.2)
        .map((s: any) => s.top_error_category)
        .filter(Boolean)
    );

    // Build few-shot examples: 2-3 per category, capped at 15 total
    const categoryDescriptions: Record<string, string> = {
      too_vague: "AI wrote generic language without specifics",
      wrong_severity: "AI misclassified severity or action level",
      missing_context: "AI didn't connect item to customer's stated concern",
      stale_treated_as_active: "AI wrote about already resolved/closed items as if active",
      wrong_agency_explanation: "AI misunderstood what an agency's violation/penalty means",
      missing_note: "AI generated no note where one was needed",
      factual_error: "AI stated something incorrect about the violation or regulation",
      tone_style: "Note was technically correct but wording was unprofessional or alarmist",
      knowledge_gap: "AI clearly lacked domain knowledge about this violation type or regulation",
      other: "Other correction type",
    };

    const fewShotExamples: string[] = [];
    // Sort categories: high edit rate first, then by count
    const sortedCategories = Object.entries(byCategory)
      .filter(([_, edits]) => edits.length >= 3)
      .sort((a, b) => {
        const aHigh = highEditRateCategories.has(a[0]) ? 1 : 0;
        const bHigh = highEditRateCategories.has(b[0]) ? 1 : 0;
        if (aHigh !== bHigh) return bHigh - aHigh;
        return b[1].length - a[1].length;
      });

    let totalExamples = 0;
    for (const [category, catEdits] of sortedCategories) {
      if (totalExamples >= 15) break;
      const desc = categoryDescriptions[category] || category;
      // Pick 2-3 diverse examples (different agencies if possible)
      const seenAgencies = new Set<string>();
      const picked: typeof catEdits = [];
      for (const edit of catEdits) {
        if (picked.length >= 3) break;
        if (!seenAgencies.has(edit.agency) || picked.length < 2) {
          picked.push(edit);
          seenAgencies.add(edit.agency);
        }
      }

      let block = `ERROR PATTERN: ${desc}\n`;
      for (let i = 0; i < picked.length; i++) {
        const e = picked[i];
        block += `  Example ${i + 1}: Original: "${(e.original_note || '(no note)').slice(0, 200)}" → Corrected: "${e.edited_note.slice(0, 200)}" (Agency: ${e.agency}, Type: ${e.item_type})\n`;
        totalExamples++;
      }
      fewShotExamples.push(block);
    }

    // PART B: Knowledge Context from active entries
    const knowledgeQuery = supabase
      .from("knowledge_entries")
      .select("*")
      .eq("status", "active")
      .order("usage_count", { ascending: false })
      .limit(20);

    const { data: allEntries } = await knowledgeQuery;
    let knowledgeEntries: any[] = [];

    if (allEntries && allEntries.length > 0) {
      // Filter to relevant agencies/violation_types if provided
      if (agencies.length > 0) {
        const relevant = allEntries.filter((e: any) => {
          if (agencies.includes(e.agency)) return true;
          const eTypes = e.violation_types || [];
          return violation_types.some((vt: string) => eTypes.includes(vt));
        });
        knowledgeEntries = relevant.length > 0 ? relevant.slice(0, 5) : allEntries.slice(0, 3);
      } else {
        knowledgeEntries = allEntries.slice(0, 5);
      }

      // Increment usage_count for selected entries
      for (const entry of knowledgeEntries) {
        await supabase
          .from("knowledge_entries")
          .update({ usage_count: (entry.usage_count || 0) + 1 })
          .eq("id", entry.id);
      }
    }

    const knowledgeContext = knowledgeEntries.map(
      (e: any) => `REFERENCE: ${e.title}\n${e.content}`
    );

    // PART C: Confidence flags from accuracy stats
    const confidenceFlags: Array<{ agency: string; violation_type: string; edit_rate: number; top_error: string; needs_review: boolean }> = [];
    for (const stat of accuracyStats || []) {
      if (stat.edit_rate > 0.3) {
        confidenceFlags.push({
          agency: stat.agency,
          violation_type: stat.violation_type || "general",
          edit_rate: Math.round(stat.edit_rate * 100),
          top_error: stat.top_error_category || "unknown",
          needs_review: stat.edit_rate > 0.5,
        });
      }
    }

    return new Response(
      JSON.stringify({
        few_shot_examples: fewShotExamples,
        knowledge_context: knowledgeContext,
        confidence_flags: confidenceFlags,
        meta: {
          total_approved_edits: edits.length,
          categories_with_examples: fewShotExamples.length,
          knowledge_entries_used: knowledgeEntries.length,
          flags_count: confidenceFlags.length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("get-learning-examples error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
