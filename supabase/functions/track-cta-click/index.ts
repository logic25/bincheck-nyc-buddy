import { createClient } from 'npm:@supabase/supabase-js@2'

// CORS=* is intentional here: this endpoint is hit by email clients as a
// redirect (GET ?id=&dest=) when a recipient clicks a CTA. There is no
// browser/Origin context to validate.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Allowlist of host suffixes the redirect endpoint will send users to.
// Anything else is rejected to prevent open-redirect phishing — an attacker
// could otherwise craft `?dest=https://evil.example/login` and the link's
// origin would appear to be our trusted edge-function domain.
const ALLOWED_HOSTS = [
  'binchecknyc.com',
  'www.binchecknyc.com',
  // Lovable preview deploys (the marketing site lives here pre-DNS cutover):
  'lovable.app',
  'lovable.dev',
]

function isHostAllowed(host: string): boolean {
  const h = host.toLowerCase()
  return ALLOWED_HOSTS.some(allowed => h === allowed || h.endsWith('.' + allowed))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const impressionId = url.searchParams.get('id')
  const dest = url.searchParams.get('dest')

  if (!dest) {
    return new Response('Missing dest parameter', { status: 400, headers: corsHeaders })
  }

  // Validate the destination URL: must parse, must use https, and the host
  // must be on our allowlist. Reject anything else with 400 rather than
  // silently sending the user somewhere unexpected.
  let destUrl: URL
  try {
    destUrl = new URL(dest)
  } catch {
    return new Response('Invalid dest URL', { status: 400, headers: corsHeaders })
  }

  if (destUrl.protocol !== 'https:' && destUrl.protocol !== 'http:') {
    return new Response('Unsupported protocol', { status: 400, headers: corsHeaders })
  }

  if (!isHostAllowed(destUrl.hostname)) {
    console.warn(`[track-cta-click] rejected redirect to disallowed host: ${destUrl.hostname}`)
    return new Response('Destination host not allowed', { status: 400, headers: corsHeaders })
  }

  // Track the click if we have an impression ID
  if (impressionId) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseKey)

      await supabase
        .from('cross_sell_impressions')
        .update({ clicked_at: new Date().toISOString() })
        .eq('id', impressionId)
        .is('clicked_at', null)
    } catch (e) {
      console.error('Failed to track click:', e)
      // Don't block redirect on tracking failure
    }
  }

  // 302 redirect to validated destination
  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      'Location': destUrl.toString(),
    },
  })
})
