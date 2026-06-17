// notify-bug-update — sends an email to the bug reporter when an admin/analyst
// replies to their bug or changes the bug's status. Uses service role to look
// up the reporter's email from auth.users (clients can't read that table).
//
// POST body: {
//   bugId: string,
//   eventType: 'reply' | 'status_change' | 'resolved',
//   message?: string,        // for replies + status-change comments
//   newStatus?: string,      // for status_change / resolved
//   actorUserId?: string,    // who triggered it; we'll skip if = reporter
// }

import { createClient } from 'npm:@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

  // Caller must be authenticated (not anon).
  const authHeader = req.headers.get('authorization') || ''
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  if (!bearer || bearer === ANON_KEY) {
    return new Response(JSON.stringify({ error: 'auth required' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: any
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { bugId, eventType, message, newStatus, actorUserId } = body || {}
  if (!bugId || !eventType) {
    return new Response(JSON.stringify({ error: 'bugId and eventType required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  // Fetch bug + reporter user_id + title
  const { data: bug, error: bugErr } = await admin
    .from('bug_reports')
    .select('id, title, user_id, status')
    .eq('id', bugId)
    .maybeSingle()
  if (bugErr || !bug) {
    return new Response(JSON.stringify({ error: 'bug not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Skip self-notification
  if (actorUserId && actorUserId === bug.user_id) {
    return new Response(JSON.stringify({ skipped: 'actor is reporter' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Look up reporter email + name
  const { data: reporter } = await admin.auth.admin.getUserById(bug.user_id)
  const reporterEmail = reporter?.user?.email
  if (!reporterEmail) {
    return new Response(JSON.stringify({ error: 'reporter email unavailable' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const { data: reporterProfile } = await admin
    .from('profiles')
    .select('display_name')
    .eq('user_id', bug.user_id)
    .maybeSingle()

  // Look up actor display name
  let actorName = 'The team'
  if (actorUserId) {
    const { data: actorProfile } = await admin
      .from('profiles')
      .select('display_name')
      .eq('user_id', actorUserId)
      .maybeSingle()
    if (actorProfile?.display_name) actorName = actorProfile.display_name
  }

  const normalizedEvent = (eventType === 'status_change' && newStatus === 'resolved')
    ? 'resolved' : eventType

  const idempotencyKey = `bug-${bugId}-${normalizedEvent}-${newStatus || ''}-${Date.now()}`

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      templateName: 'bug-status-update',
      recipientEmail: reporterEmail,
      idempotencyKey,
      templateData: {
        reporterName: reporterProfile?.display_name?.split(' ')[0] || null,
        bugTitle: bug.title,
        eventType: normalizedEvent,
        actorName,
        newStatus: newStatus || null,
        message: message || null,
        bugId,
      },
    }),
  })

  const respText = await resp.text()
  return new Response(JSON.stringify({ ok: resp.ok, status: resp.status, body: respText }), {
    status: resp.ok ? 200 : 502,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
