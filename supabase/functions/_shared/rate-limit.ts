// Shared rate-limit helper for BinCheck edge functions.
//
// Calls the `check_rate_limit` Postgres RPC (Phase 2 migration) which uses a
// sliding-window bucket stored in `rate_limit_buckets`. Returns either an
// `ok` outcome (caller continues) or a `limited` outcome carrying a ready-made
// 429 Response with `Retry-After` and `X-RateLimit-*` headers.
//
// Usage pattern (inside an edge function handler):
//
//   const rl = await checkRateLimit(adminClient, {
//     key: `report:${userId}`,
//     limit: 5,
//     windowMinutes: 60,
//     corsHeaders,
//   });
//   if (rl.limited) return rl.response;
//
// Design notes:
// - Keys are namespaced strings ("scope:identifier") so you can mix per-user,
//   per-IP, per-resource buckets in one table.
// - We swallow RPC errors (log + allow) so a transient DB hiccup never
//   bricks production. Strict mode can be added later if needed.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface RateLimitOptions {
  /** Namespaced bucket key, e.g. "report:<userId>" or "invite:<ip>" */
  key: string;
  /** Max requests permitted in the window */
  limit: number;
  /** Sliding window length in minutes */
  windowMinutes: number;
  /** CORS headers to attach to the 429 response */
  corsHeaders: Record<string, string>;
}

export interface RateLimitOk {
  limited: false;
  count: number;
  limit: number;
  remaining: number;
}

export interface RateLimitBlocked {
  limited: true;
  response: Response;
  retryAfterSeconds: number;
}

export type RateLimitResult = RateLimitOk | RateLimitBlocked;

/** Pull a best-effort client identifier (forwarded IP) from a Request. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export async function checkRateLimit(
  adminClient: SupabaseClient,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  try {
    const { data, error } = await adminClient.rpc("check_rate_limit", {
      p_key: opts.key,
      p_max: opts.limit,
      p_window_minutes: opts.windowMinutes,
    });

    if (error) {
      // Fail-open: log and allow. Better to let traffic through than to brick
      // the product on a transient DB issue.
      console.error("checkRateLimit: RPC error, failing open", {
        key: opts.key,
        error: error.message,
      });
      return {
        limited: false,
        count: 0,
        limit: opts.limit,
        remaining: opts.limit,
      };
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | {
          allowed: boolean;
          count: number;
          limit: number;
          retry_after_seconds: number;
        }
      | null;

    if (!row) {
      console.error("checkRateLimit: empty RPC result, failing open", {
        key: opts.key,
      });
      return {
        limited: false,
        count: 0,
        limit: opts.limit,
        remaining: opts.limit,
      };
    }

    if (row.allowed) {
      return {
        limited: false,
        count: row.count,
        limit: row.limit,
        remaining: Math.max(0, row.limit - row.count),
      };
    }

    const retryAfter = Math.max(1, row.retry_after_seconds);
    const response = new Response(
      JSON.stringify({
        error: "Rate limit exceeded",
        retry_after_seconds: retryAfter,
        limit: row.limit,
      }),
      {
        status: 429,
        headers: {
          ...opts.corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(row.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(
            Math.floor(Date.now() / 1000) + retryAfter,
          ),
        },
      },
    );

    return { limited: true, response, retryAfterSeconds: retryAfter };
  } catch (e) {
    console.error("checkRateLimit: unexpected error, failing open", e);
    return {
      limited: false,
      count: 0,
      limit: opts.limit,
      remaining: opts.limit,
    };
  }
}
