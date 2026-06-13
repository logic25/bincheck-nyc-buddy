/**
 * send-report-email
 *
 * Triggered (via invoke) when dd_reports.workflow_status transitions to
 * 'analyst_approved'. Sends a PDF delivery email to the requester via Resend,
 * then logs the send in the email_log table.
 *
 * Payload (JSON body):
 *   report_id      string  — UUID of the dd_reports row
 *   recipient_email string — Override address (falls back to report.client_email)
 *
 * Behaviour:
 *   1. Fetches report metadata (address, client_name, client_firm, pdf_url,
 *      client_email, requested_by_role, scope_of_work).
 *   2. Generates a short-lived signed URL for the PDF (if stored in Supabase
 *      Storage); falls back to pdf_url if it's already a public URL.
 *   3. Sends via Resend REST API using the existing `mail.binchecknyc.com` domain.
 *   4. Marks workflow_status = 'sent' on the report.
 *   5. Inserts a row into public.email_log.
 *
 * YW Law special handling:
 *   If client_firm contains "YW Law" or "YW" (case-insensitive), a P.S. is
 *   appended acknowledging the standing 10/week order arrangement.
 *
 * Auth: requires service-role key or a valid user JWT (same guard as
 * send-transactional-email). Anon-only calls are rejected.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "hello@mail.binchecknyc.com";
const FROM_NAME = "BinCheckNYC";
const SITE_URL = "https://binchecknyc.com";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailHtml(opts: {
  clientName: string | null;
  address: string;
  downloadUrl: string;
  scopeOfWork: string | null;
  requestedByRole: string | null;
  isYwLaw: boolean;
}): string {
  const { clientName, address, downloadUrl, scopeOfWork, requestedByRole, isYwLaw } = opts;

  const greeting = clientName
    ? `Hi ${escapeHtml(clientName)},`
    : "Hi,";

  const contextLine = scopeOfWork
    ? `<p>Your report covers: <em>${escapeHtml(scopeOfWork)}</em>.</p>`
    : "";

  const ywPs = isYwLaw
    ? `<p style="margin-top:24px; font-size:13px; color:#6b7280;">
        <strong>P.S.</strong> As always, this report is part of your standing 10/week arrangement with BinCheckNYC.
        We'll continue to prioritize your queue accordingly. Reach out any time with questions.
      </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your BinCheckNYC Report is Ready</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
             background: #f9fafb; margin: 0; padding: 32px 16px; color: #111827;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px;
              border: 1px solid #e5e7eb; padding: 32px;">

    <!-- Header -->
    <div style="border-bottom: 2px solid #f3f4f6; padding-bottom: 16px; margin-bottom: 24px;">
      <p style="margin: 0; font-size: 11px; font-weight: 700; letter-spacing: 0.15em;
                text-transform: uppercase; color: #6b7280;">BinCheckNYC</p>
      <h1 style="margin: 8px 0 0; font-size: 22px; font-weight: 700; color: #111827;">
        Your report is ready
      </h1>
    </div>

    <!-- Body -->
    <p>${escapeHtml(greeting)}</p>
    <p>Your NYC property compliance report for <strong>${escapeHtml(address)}</strong>
       has been reviewed and approved by our analyst team.</p>

    ${contextLine}

    <!-- CTA -->
    <div style="text-align: center; margin: 32px 0;">
      <a href="${escapeHtml(downloadUrl)}"
         style="display: inline-block; background: #1d4ed8; color: #fff; font-weight: 600;
                text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 15px;">
        Download Report (PDF)
      </a>
    </div>

    <p style="font-size: 13px; color: #6b7280;">
      If the button above doesn't work, copy and paste this link into your browser:<br />
      <a href="${escapeHtml(downloadUrl)}" style="color: #1d4ed8; word-break: break-all;">
        ${escapeHtml(downloadUrl)}
      </a>
    </p>

    <!-- Invoice note -->
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;
                padding: 16px; margin-top: 24px;">
      <p style="margin: 0; font-size: 13px; color: #166534;">
        <strong>Billing note:</strong> This report will appear on your monthly invoice.
        No action is needed on your end — we'll send your invoice at the end of the billing cycle.
        Questions? Reply to this email or reach us at
        <a href="mailto:hello@binchecknyc.com" style="color: #166534;">hello@binchecknyc.com</a>.
      </p>
    </div>

    ${ywPs}

    <!-- Footer -->
    <p style="margin-top: 32px; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6;
              padding-top: 16px;">
      BinCheckNYC · NYC Property Compliance Reports<br />
      <a href="${SITE_URL}" style="color: #9ca3af;">${SITE_URL}</a>
    </p>
  </div>
</body>
</html>`;
}

function buildEmailText(opts: {
  clientName: string | null;
  address: string;
  downloadUrl: string;
  scopeOfWork: string | null;
  isYwLaw: boolean;
}): string {
  const { clientName, address, downloadUrl, scopeOfWork, isYwLaw } = opts;
  const greeting = clientName ? `Hi ${clientName},` : "Hi,";
  const contextLine = scopeOfWork ? `\nReport scope: ${scopeOfWork}\n` : "";
  const ywPs = isYwLaw
    ? "\n\nP.S. This report is part of your standing 10/week arrangement with BinCheckNYC. We'll continue to prioritize your queue accordingly."
    : "";

  return `${greeting}

Your NYC property compliance report for ${address} has been reviewed and approved.
${contextLine}
Download your report: ${downloadUrl}

Billing note: This report will appear on your monthly invoice. No action needed — we'll send your invoice at the end of the billing cycle.${ywPs}

—
BinCheckNYC · NYC Property Compliance Reports
${SITE_URL}`;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: "Server configuration error: missing Supabase env vars" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!resendApiKey) {
    return new Response(
      JSON.stringify({ error: "Server configuration error: RESEND_API_KEY not set" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Auth guard — same pattern as send-transactional-email.
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!bearer) {
    return new Response(
      JSON.stringify({ error: "Authentication required" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const isServiceRole = bearer === supabaseServiceKey;
  let actorId: string | null = null;

  if (!isServiceRole) {
    if (bearer === supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: "User authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    try {
      const userClient = createClient(supabaseUrl, supabaseAnonKey ?? "", {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(
          JSON.stringify({ error: "Invalid authentication token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      actorId = userData.user.id;
    } catch {
      return new Response(
        JSON.stringify({ error: "Authentication check failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  // Parse body
  let reportId: string;
  let recipientEmailOverride: string | null = null;
  try {
    const body = await req.json();
    reportId = body.report_id;
    recipientEmailOverride = body.recipient_email ?? null;
    if (!reportId) throw new Error("report_id is required");
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? "Invalid request body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Service client (bypasses RLS for all DB ops)
  const db = createClient(supabaseUrl, supabaseServiceKey);

  // Fetch report
  const { data: report, error: reportErr } = await db
    .from("dd_reports")
    .select(
      "id, address, client_name, client_email, client_firm, pdf_url, scope_of_work, requested_by_role, workflow_status",
    )
    .eq("id", reportId)
    .single();

  if (reportErr || !report) {
    return new Response(
      JSON.stringify({ error: "Report not found", detail: reportErr?.message }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const recipientEmail: string =
    recipientEmailOverride?.trim() ||
    (report as any).client_email?.trim() ||
    "";

  if (!recipientEmail) {
    return new Response(
      JSON.stringify({ error: "No recipient email: set client_email on the report or pass recipient_email in the body" }),
      { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Resolve PDF download URL
  // pdf_url can be:
  //   a) a full public URL (https://...)
  //   b) a Supabase Storage path (bucket/path) — we generate a signed URL
  let downloadUrl: string = (report as any).pdf_url ?? "";

  if (downloadUrl && !downloadUrl.startsWith("http")) {
    // Treat as storage path: "bucket-name/some/path.pdf"
    const slashIdx = downloadUrl.indexOf("/");
    if (slashIdx > 0) {
      const bucket = downloadUrl.slice(0, slashIdx);
      const path = downloadUrl.slice(slashIdx + 1);
      const { data: signedData, error: signErr } = await db.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days
      if (!signErr && signedData?.signedUrl) {
        downloadUrl = signedData.signedUrl;
      }
    }
  }

  // Fallback: link to the web report viewer
  if (!downloadUrl) {
    downloadUrl = `${SITE_URL}/dd-reports?report=${reportId}`;
  }

  const isYwLaw =
    /yw\s*law/i.test((report as any).client_firm ?? "") ||
    /\byw\b/i.test((report as any).client_firm ?? "");

  const emailHtml = buildEmailHtml({
    clientName: (report as any).client_name,
    address: (report as any).address,
    downloadUrl,
    scopeOfWork: (report as any).scope_of_work,
    requestedByRole: (report as any).requested_by_role,
    isYwLaw,
  });

  const emailText = buildEmailText({
    clientName: (report as any).client_name,
    address: (report as any).address,
    downloadUrl,
    scopeOfWork: (report as any).scope_of_work,
    isYwLaw,
  });

  const emailSubject = `Your BinCheckNYC report is ready — ${(report as any).address}`;

  // Send via Resend
  let resendId: string | null = null;
  let sendStatus: "sent" | "failed" = "failed";
  let sendError: string | null = null;

  try {
    const resendResp = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_ADDRESS}>`,
        to: [recipientEmail],
        subject: emailSubject,
        html: emailHtml,
        text: emailText,
      }),
    });

    if (resendResp.ok) {
      const resendBody = await resendResp.json();
      resendId = resendBody.id ?? null;
      sendStatus = "sent";
    } else {
      const errBody = await resendResp.text();
      sendError = `Resend ${resendResp.status}: ${errBody}`;
      console.error("Resend error:", sendError);
    }
  } catch (err: any) {
    sendError = err.message ?? "Resend fetch failed";
    console.error("Resend fetch error:", sendError);
  }

  // Update report workflow_status
  if (sendStatus === "sent") {
    await db
      .from("dd_reports")
      .update({
        workflow_status: "sent",
        sent_to_email: recipientEmail,
        sent_at: new Date().toISOString(),
      } as any)
      .eq("id", reportId);
  }

  // Log the attempt
  await db.from("email_log").insert({
    report_id: reportId,
    recipient: recipientEmail,
    subject: emailSubject,
    resend_id: resendId,
    status: sendStatus,
    error: sendError,
    sent_by: actorId,
    metadata: {
      is_yw_law: isYwLaw,
      address: (report as any).address,
      download_url: downloadUrl,
    },
  } as any);

  if (sendStatus === "sent") {
    return new Response(
      JSON.stringify({ ok: true, resend_id: resendId, recipient: recipientEmail }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } else {
    return new Response(
      JSON.stringify({ ok: false, error: sendError }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
