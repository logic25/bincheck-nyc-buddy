// Shared CORS helper for BinCheck edge functions.
//
// Production: binchecknyc.com (with and without www)
// Lovable preview: id-preview--<id>.lovable.app and *.lovable.app subdomains
// Lovable IDE: *.lovableproject.com subdomains
// Local dev: localhost:5173 (Vite), localhost:8080 (Lovable preview server)
//
// Echoes the caller's origin back if allowed; otherwise falls back to the
// canonical production origin so browsers reject the response cleanly.

const STATIC_ORIGINS = new Set([
  "https://binchecknyc.com",
  "https://www.binchecknyc.com",
  "https://id-preview--5687520e-43de-4827-98f8-73a2100ce635.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
]);

const LOVABLE_SUBDOMAIN = /^https:\/\/[a-z0-9-]+\.lovable\.app$/;
const LOVABLE_PROJECT = /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/;

const CANONICAL = "https://binchecknyc.com";

export function getCorsHeaders(req: Request, extraAllowedHeaders: string[] = []): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowed =
    STATIC_ORIGINS.has(origin) ||
    LOVABLE_SUBDOMAIN.test(origin) ||
    LOVABLE_PROJECT.test(origin);
  const allowOrigin = allowed ? origin : CANONICAL;
  const headers = ["authorization", "x-client-info", "apikey", "content-type", ...extraAllowedHeaders];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": headers.join(", "),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}
