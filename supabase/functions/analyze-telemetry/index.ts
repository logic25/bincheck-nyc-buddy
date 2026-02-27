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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    const { mode } = body;

    // ── MODE: idea ──────────────────────────────────────────────────────────
    if (mode === "idea") {
      const { raw_idea, existing_titles = [] } = body;
      if (!raw_idea) return new Response(JSON.stringify({ error: "raw_idea required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const systemPrompt = `You are a senior product analyst for a NYC property due diligence SaaS. 
Stress-test the given product idea: surface risks, flag duplicates against existing roadmap items, score priority, and return structured analysis.
category must be one of: billing, projects, integrations, operations, general.
priority must be one of: high, medium, low.`;

      const userPrompt = `Analyze this product idea: "${raw_idea}"
${existing_titles.length > 0 ? `\nExisting roadmap items to check for duplicates:\n${existing_titles.map((t: string) => `- ${t}`).join("\n")}` : ""}`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "suggest_analysis",
              description: "Return the structured stress-test analysis of the product idea.",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Refined, clear title for this idea" },
                  description: { type: "string", description: "2-3 sentence description of the feature" },
                  category: { type: "string", enum: ["billing", "projects", "integrations", "operations", "general"] },
                  priority: { type: "string", enum: ["high", "medium", "low"] },
                  evidence: { type: "string", description: "Why this matters — business case and evidence" },
                  duplicate_warning: { type: "string", description: "If duplicate detected, describe the overlap. Empty string if no duplicate." },
                  challenges: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        problem: { type: "string" },
                        solution: { type: "string" },
                      },
                      required: ["problem", "solution"],
                    },
                    description: "List of challenges and their solutions",
                  },
                },
                required: ["title", "description", "category", "priority", "evidence", "duplicate_warning", "challenges"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "suggest_analysis" } },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("AI gateway error:", response.status, errText);
        throw new Error(`AI gateway error: ${response.status}`);
      }

      const aiData = await response.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new Error("No tool call returned from AI");

      const result = JSON.parse(toolCall.function.arguments);

      // Log usage
      const totalTokens = aiData.usage?.total_tokens || 800;
      await supabase.from("ai_usage_logs").insert({
        feature: "stress_test",
        model: "google/gemini-3-flash-preview",
        prompt_tokens: aiData.usage?.prompt_tokens || 0,
        completion_tokens: aiData.usage?.completion_tokens || 0,
        total_tokens: totalTokens,
        estimated_cost_usd: totalTokens * 0.00000015,
        metadata: { idea_title: result.title },
      });

      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── MODE: telemetry ─────────────────────────────────────────────────────
    if (mode === "telemetry") {
      // Fetch order_leads stats
      const { data: leads } = await supabase.from("order_leads").select("step_reached, rush_requested, converted, created_at");
      const all = leads || [];
      const total = all.length;
      const converted = all.filter((l: any) => l.converted).length;
      const rushCount = all.filter((l: any) => l.rush_requested).length;

      // Step distribution
      const stepCounts: Record<number, number> = {};
      all.forEach((l: any) => {
        const s = l.step_reached || 1;
        stepCounts[s] = (stepCounts[s] || 0) + 1;
      });

      // Recent 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const recent = all.filter((l: any) => l.created_at >= thirtyDaysAgo);

      const summary = `Order funnel data (all time):
- Total order form submissions: ${total}
- Converted to reports: ${converted} (${total ? Math.round(converted / total * 100) : 0}%)
- Rush requests: ${rushCount}
- Step distribution: ${Object.entries(stepCounts).sort(([a],[b]) => Number(a)-Number(b)).map(([s,c]) => `Step ${s}: ${c} users`).join(", ")}
- Recent 30 days: ${recent.length} submissions, ${recent.filter((l:any)=>l.converted).length} converted`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "You are a UX analyst specializing in SaaS onboarding funnels. Identify friction points and drop-off patterns in order form data." },
            { role: "user", content: `${summary}\n\nIdentify up to 5 UX friction points or drop-off patterns. For each, provide a title, description, and priority (high/medium/low).` },
          ],
          tools: [{
            type: "function",
            function: {
              name: "identify_gaps",
              description: "Return up to 5 UX friction points identified from the funnel data.",
              parameters: {
                type: "object",
                properties: {
                  gaps: {
                    type: "array",
                    maxItems: 5,
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        priority: { type: "string", enum: ["high", "medium", "low"] },
                      },
                      required: ["title", "description", "priority"],
                    },
                  },
                },
                required: ["gaps"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "identify_gaps" } },
        }),
      });

      if (!response.ok) throw new Error(`AI gateway error: ${response.status}`);

      const aiData = await response.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new Error("No tool call returned");

      const { gaps } = JSON.parse(toolCall.function.arguments);

      const totalTokens = aiData.usage?.total_tokens || 600;
      await supabase.from("ai_usage_logs").insert({
        feature: "telemetry_analysis",
        model: "google/gemini-3-flash-preview",
        prompt_tokens: aiData.usage?.prompt_tokens || 0,
        completion_tokens: aiData.usage?.completion_tokens || 0,
        total_tokens: totalTokens,
        estimated_cost_usd: totalTokens * 0.00000015,
        metadata: { total_leads: total, converted },
      });

      return new Response(JSON.stringify({ gaps }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid mode. Use 'idea' or 'telemetry'." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("analyze-telemetry error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
