// fetch-acris-bbl
// ----------------------------------------------------------------------------
// Cached ACRIS-by-BBL lookup. Reads through the `acris_cache` table; on a miss
// (or expired row) it hits NYC Open Data (Socrata) and writes the normalized
// payload back. Returns the same shape that `generate-dd-report` already
// consumes: { documents, deeds, mortgages, liens }.
//
// Auth: requires either a service-role JWT (server-to-server) or a signed-in
// user — anon callers are rejected. The data itself is public so this is a
// rate-limiting concern, not a confidentiality one.
//
// Usage:
//   POST /functions/v1/fetch-acris-bbl
//   { "bbl": "1009620001", "force_refresh": false }

import { createClient } from 'npm:@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

interface AcrisPayload {
  documents: AcrisDocument[]
  deeds: AcrisDocument[]
  mortgages: AcrisDocument[]
  liens: AcrisDocument[]
}

interface AcrisDocument {
  document_id: string | null
  document_type: string | null
  document_date: string | null
  recorded_date: string | null
  document_amount: number | null
  party1: string | null
  party2: string | null
  crfn: string | null
  detail_url: string | null
  image_view_url: string | null
  get_image_url: string | null
}

const EMPTY_PAYLOAD: AcrisPayload = { documents: [], deeds: [], mortgages: [], liens: [] }

const NYC_ENDPOINTS = {
  ACRIS_MASTER:  'https://data.cityofnewyork.us/resource/bnx9-e6tj.json',
  ACRIS_PARTIES: 'https://data.cityofnewyork.us/resource/636b-3b5g.json',
  ACRIS_LEGALS:  'https://data.cityofnewyork.us/resource/8h5j-fqxa.json',
}

const DEED_TYPES     = ['DEED', 'DEEDO', 'DEEDP', 'DEEDM', 'RPTT&RETT']
const MORTGAGE_TYPES = ['MTGE', 'AGMT', 'ASST', 'SMTG', 'CMTG']
const LIEN_TYPES     = ['LIEN', 'FEDL', 'MECH', 'JUDGM', 'UCC1', 'UCC3']

function buildACRISDocDetailUrl(docId: string)    { return `https://a836-acris.nyc.gov/DS/DocumentSearch/DocumentDetail?doc_id=${docId}` }
function buildACRISDocImageViewUrl(docId: string) { return `https://a836-acris.nyc.gov/DS/DocumentSearch/DocumentImageView?doc_id=${docId}` }
function buildACRISGetImageUrl(docId: string, p = 1) { return `https://a836-acris.nyc.gov/DS/DocumentSearch/GetImage?doc_id=${docId}&page=${p}` }

async function fetchNYCData(endpoint: string, params: Record<string, string>): Promise<any[]> {
  const url = new URL(endpoint)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const token = Deno.env.get('NYC_APP_TOKEN')
  if (token) url.searchParams.set('$$app_token', token)
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    console.warn('Socrata request failed', { endpoint, status: res.status })
    return []
  }
  return (await res.json().catch(() => [])) as any[]
}

async function fetchACRISFromSocrata(bbl10: string): Promise<AcrisPayload> {
  const borough = bbl10.charAt(0)
  const block   = parseInt(bbl10.slice(1, 6), 10)
  const lot     = parseInt(bbl10.slice(6, 10), 10)

  const legalRecords = await fetchNYCData(NYC_ENDPOINTS.ACRIS_LEGALS, {
    $where: `borough='${borough}' AND block=${block} AND lot=${lot}`,
    $limit: '30',
    $order: 'document_id DESC',
  })
  if (legalRecords.length === 0) return EMPTY_PAYLOAD

  const docIds = [...new Set(legalRecords.map((r: any) => r.document_id).filter(Boolean))]
  if (docIds.length === 0) return EMPTY_PAYLOAD
  const idList = docIds.map((id: string) => `'${id}'`).join(',')

  const [masterRecords, parties] = await Promise.all([
    fetchNYCData(NYC_ENDPOINTS.ACRIS_MASTER, {
      $where: `document_id in(${idList})`,
      $limit: '30',
      $order: 'document_date DESC',
    }),
    fetchNYCData(NYC_ENDPOINTS.ACRIS_PARTIES, {
      $where: `document_id in(${idList})`,
      $limit: '200',
    }),
  ])

  const partiesMap: Record<string, any[]> = {}
  for (const p of parties) {
    if (!partiesMap[p.document_id]) partiesMap[p.document_id] = []
    partiesMap[p.document_id].push(p)
  }

  const documents: AcrisDocument[] = masterRecords.map((r: any) => {
    const docParties = partiesMap[r.document_id] || []
    const party1 =
      docParties.filter((p: any) => p.party_type === '1').map((p: any) => [p.name].filter(Boolean).join(' ')).join('; ') || null
    const party2 =
      docParties.filter((p: any) => p.party_type === '2').map((p: any) => [p.name].filter(Boolean).join(' ')).join('; ') || null
    const docId = r.document_id
    return {
      document_id:     docId,
      document_type:   r.doc_type || r.document_type || null,
      document_date:   r.document_date || null,
      recorded_date:   r.recorded_datetime || null,
      document_amount: r.document_amt ? parseFloat(r.document_amt) : null,
      party1,
      party2,
      crfn:            r.crfn || null,
      detail_url:      docId ? buildACRISDocDetailUrl(docId) : null,
      image_view_url:  docId ? buildACRISDocImageViewUrl(docId) : null,
      get_image_url:   docId ? buildACRISGetImageUrl(docId, 1) : null,
    }
  })

  const docType = (d: AcrisDocument) => (d.document_type || '').toUpperCase()
  return {
    documents,
    deeds:     documents.filter((d) => DEED_TYPES.includes(docType(d))),
    mortgages: documents.filter((d) => MORTGAGE_TYPES.includes(docType(d))),
    liens:     documents.filter((d) => LIEN_TYPES.includes(docType(d))),
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl        = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const supabaseAnonKey    = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Auth: reject anon-only callers.
  const authHeader = req.headers.get('authorization') || ''
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  if (!bearer) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const isServiceRole = bearer === supabaseServiceKey
  if (!isServiceRole) {
    if (bearer === supabaseAnonKey) {
      return new Response(JSON.stringify({ error: 'User authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    try {
      const userClient = createClient(supabaseUrl, supabaseAnonKey ?? '', {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: userData, error: userErr } = await userClient.auth.getUser()
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Invalid authentication token' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Authentication check failed' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  let body: { bbl?: string; force_refresh?: boolean }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const raw = (body.bbl || '').toString()
  const bbl10 = raw.replace(/\D/g, '')
  if (bbl10.length !== 10) {
    return new Response(JSON.stringify({ error: 'BBL must be 10 digits' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 1. Try cache unless force_refresh
  if (!body.force_refresh) {
    const { data: cached, error: cacheErr } = await supabase.rpc('get_acris_cache', { _bbl: bbl10 })
    if (cacheErr) {
      console.warn('get_acris_cache failed (will fall through to live fetch)', cacheErr)
    } else if (cached) {
      return new Response(JSON.stringify({ source: 'cache', bbl: bbl10, payload: cached }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // 2. Live fetch from Socrata + persist
  let payload: AcrisPayload
  try {
    payload = await fetchACRISFromSocrata(bbl10)
  } catch (e) {
    console.error('Socrata fetch failed', e)
    return new Response(JSON.stringify({ error: 'Upstream ACRIS fetch failed' }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { error: upsertErr } = await supabase.rpc('upsert_acris_cache', {
    _bbl: bbl10,
    _payload: payload,
  })
  if (upsertErr) {
    // Cache write failure shouldn't block the caller — they still get fresh data.
    console.warn('upsert_acris_cache failed', upsertErr)
  }

  return new Response(JSON.stringify({ source: 'live', bbl: bbl10, payload }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
