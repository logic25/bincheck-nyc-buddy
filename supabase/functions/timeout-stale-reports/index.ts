import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find reports stuck in 'generating' for more than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: staleReports, error: fetchError } = await supabase
      .from("dd_reports")
      .select("id, address, user_id, created_at, generation_started_at")
      .eq("status", "generating")
      .or(`generation_started_at.lt.${tenMinutesAgo},generation_started_at.is.null`)
      .lt("updated_at", tenMinutesAgo);

    if (fetchError) {
      console.error("Error fetching stale reports:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!staleReports || staleReports.length === 0) {
      return new Response(JSON.stringify({ message: "No stale reports found", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update all stale reports to 'error' status
    const staleIds = staleReports.map((r) => r.id);
    const { error: updateError } = await supabase
      .from("dd_reports")
      .update({ status: "error" })
      .in("id", staleIds);

    if (updateError) {
      console.error("Error updating stale reports:", updateError);
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const addresses = staleReports.map((r) => r.address).join(", ");
    console.log(`Timed out ${staleIds.length} stale reports: ${addresses}`);

    return new Response(
      JSON.stringify({
        message: `Timed out ${staleIds.length} stale report(s)`,
        count: staleIds.length,
        reports: staleReports.map((r) => ({ id: r.id, address: r.address })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
