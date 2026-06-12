import { createClient } from 'npm:@supabase/supabase-js@2'

// CORS=* is intentional here: this endpoint is hit by email clients as a
// redirect (GET ?id=&dest=) when a recipient clicks a CTA. There is no
// browser/Origin context to validate, and the side effect is only logging an
// impression — no data is leaked back to the caller.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  // 302 redirect to destination
  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      'Location': dest,
    },
  })
})
