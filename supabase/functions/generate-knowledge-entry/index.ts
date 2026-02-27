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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { candidate_id } = await req.json();
    if (!candidate_id) {
      return new Response(JSON.stringify({ error: "Missing candidate_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the candidate
    const { data: candidate, error: candErr } = await supabase
      .from("knowledge_candidates")
      .select("*")
      .eq("id", candidate_id)
      .single();

    if (candErr || !candidate) {
      return new Response(JSON.stringify({ error: "Candidate not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch related approved edits for this agency + violation types
    let editQuery = supabase
      .from("report_edits")
      .select("*")
      .eq("status", "approved")
      .eq("agency", candidate.agency)
      .order("created_at", { ascending: false })
      .limit(50);

    const { data: relatedEdits } = await editQuery;
    const edits = relatedEdits || [];

    // Filter to edits matching violation types if specified
    const vTypes = candidate.violation_types || [];
    const filteredEdits = vTypes.length > 0
      ? edits.filter((e: any) => {
          const combined = `${e.item_identifier} ${e.edited_note}`.toLowerCase();
          return vTypes.some((vt: string) => combined.includes(vt.replace(/_/g, " ")));
        })
      : edits;

    const examplesForPrompt = (filteredEdits.length > 0 ? filteredEdits : edits)
      .slice(0, 15)
      .map((e: any, i: number) =>
        `${i + 1}. Original: "${(e.original_note || '(no note)').slice(0, 300)}"\n   Corrected: "${e.edited_note.slice(0, 300)}"\n   Error Type: ${e.error_category}\n   Item: ${e.item_identifier}`
      )
      .join("\n\n");

    const prompt = `Based on the following corrections made by expert compliance analysts, write a reference guide that an AI should use when writing notes about ${candidate.agency} ${vTypes.join(", ") || "general"} items.

The guide should explain:
1. What this violation type means in plain English
2. Typical severity levels and what determines severity
3. What penalty ranges are normal for this type
4. What a buyer, attorney, or title closer needs to know about this type of item
5. Common misconceptions that the AI has been getting wrong (based on the corrections below)
6. Key NYC regulations or local laws that apply

IMPORTANT: Write factually. Do not use advisory language. State what things ARE, not what someone SHOULD do.

Here are the analyst corrections that triggered this knowledge gap:

${examplesForPrompt}

The guide should be 300-600 words, written in clear paragraphs. No markdown formatting.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "You are an expert NYC building compliance analyst writing internal reference material for an AI system. Your guides will be injected into AI prompts to improve future note generation. Write factually and precisely. Reference specific NYC codes, local laws, and agency procedures where relevant.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    const wordCount = content.split(/\s+/).length;

    // Save knowledge entry
    const { data: entry, error: insertErr } = await supabase
      .from("knowledge_entries")
      .insert({
        candidate_id,
        title: candidate.title,
        content,
        agency: candidate.agency,
        violation_types: candidate.violation_types,
        word_count: wordCount,
        status: "draft",
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    // Update candidate status to 'drafted'
    await supabase
      .from("knowledge_candidates")
      .update({ status: "drafted", updated_at: new Date().toISOString() })
      .eq("id", candidate_id);

    return new Response(
      JSON.stringify({ success: true, entry }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-knowledge-entry error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
