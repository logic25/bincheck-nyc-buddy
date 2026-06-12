// Shared authentication helpers for BinCheck edge functions.
//
// Use `requireUser` for functions that need any authenticated caller, and
// `requireAdmin` for admin-only operations (AI learning, knowledge gaps,
// accuracy stats, roadmap telemetry analysis, etc.).
//
// All helpers throw a structured `AuthError` you can catch and turn into a
// Response. They never return a `null` user — if they return, the caller is
// authenticated (and, for `requireAdmin`, confirmed admin).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface AuthContext {
  userId: string;
  email: string | null;
  /** Service-role client. Bypasses RLS; use carefully. */
  adminClient: SupabaseClient;
  /** Anon client carrying the caller's JWT. Respects RLS. */
  userClient: SupabaseClient;
}

function getEnv(): { supabaseUrl: string; anonKey: string; serviceKey: string } {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    throw new AuthError("Server misconfigured: missing Supabase env", 500);
  }
  return { supabaseUrl, anonKey, serviceKey };
}

/**
 * Resolve the caller from the `Authorization: Bearer <jwt>` header.
 * Throws AuthError(401) if missing or invalid.
 */
export async function requireUser(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Unauthorized: missing bearer token", 401);
  }
  const token = authHeader.slice("Bearer ".length);

  const { supabaseUrl, anonKey, serviceKey } = getEnv();
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceKey);

  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user) {
    throw new AuthError("Unauthorized: invalid token", 401);
  }

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    adminClient,
    userClient,
  };
}

/**
 * Resolve the caller and verify they have an admin role in `user_roles`.
 * Throws AuthError(401) if no/invalid token, AuthError(403) if not admin.
 */
export async function requireAdmin(req: Request): Promise<AuthContext> {
  const ctx = await requireUser(req);
  const { data, error } = await ctx.adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) {
    console.error("requireAdmin: user_roles lookup failed", error);
    throw new AuthError("Forbidden", 403);
  }
  if (!data) {
    throw new AuthError("Forbidden: admin role required", 403);
  }
  return ctx;
}

/**
 * Verify a request is from our cron infrastructure or service-role caller.
 * Looks for `x-cron-secret: <CRON_SECRET>` header.
 */
export function requireCron(req: Request): void {
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) {
    throw new AuthError("Server misconfigured: CRON_SECRET unset", 500);
  }
  const provided = req.headers.get("x-cron-secret");
  if (!provided || provided !== expected) {
    throw new AuthError("Unauthorized: invalid cron secret", 401);
  }
}

/**
 * Convert an AuthError (or any error) into a JSON Response.
 * Use in catch blocks for consistent error shape.
 */
export function authErrorResponse(err: unknown, corsHeaders: Record<string, string>): Response {
  if (err instanceof AuthError) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  console.error("Unexpected auth error:", err);
  return new Response(JSON.stringify({ error: "Internal error" }), {
    status: 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
