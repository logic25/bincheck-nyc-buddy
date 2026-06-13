// BIS scraper proxy — forwards to Railway Playwright service.
// Env: BIS_SCRAPER_URL, BIS_SCRAPER_SECRET
// Called by: generate-dd-report fetchBISLive()

// Thin Deno proxy that keeps scraper credentials server-side:
//  - BIS_SCRAPER_URL   → Railway deployment URL (e.g. https://bincheck-bis-scraper-production.up.railway.app)
//  - BIS_SCRAPER_SECRET → shared secret for X-Scraper-Secret header
//
// The frontend never sees the scraper URL or secret; all audit logging
// is centralized here in the Supabase edge layer.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCRAPER_TIMEOUT_MS = 60_000; // 60 seconds

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const scraperUrl = Deno.env.get("BIS_SCRAPER_URL");
  const scraperSecret = Deno.env.get("BIS_SCRAPER_SECRET");

  if (!scraperUrl || !scraperSecret) {
    console.error("[bis-scraper-proxy] Missing BIS_SCRAPER_URL or BIS_SCRAPER_SECRET env vars");
    return new Response(
      JSON.stringify({ error: "Scraper not configured" }),
      { status: 503, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const targetUrl = `${scraperUrl}/api/scrape`;
  console.log(`[bis-scraper-proxy] Forwarding to ${scraperUrl}/api/scrape`, JSON.stringify(body));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SCRAPER_TIMEOUT_MS);

  try {
    const scraperResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Scraper-Secret": scraperSecret,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseText = await scraperResponse.text();
    console.log(`[bis-scraper-proxy] Scraper responded ${scraperResponse.status}, body length=${responseText.length}`);

    // Forward the scraper response verbatim, preserving status code
    return new Response(responseText, {
      status: scraperResponse.status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": scraperResponse.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    const message = isTimeout
      ? "Scraper request timed out after 60s"
      : `Scraper fetch error: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[bis-scraper-proxy] ${message}`);
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: isTimeout ? 504 : 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});
