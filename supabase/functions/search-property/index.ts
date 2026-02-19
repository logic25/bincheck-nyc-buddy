import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const NYC_DATA_BASE = "https://data.cityofnewyork.us/resource";

// Dataset IDs
const DOB_VIOLATIONS = "3h2n-5cm9";
const DOB_ECB_VIOLATIONS = "6bgk-3dad";
const HPD_VIOLATIONS = "wvxf-dwi5";
const DOB_PERMITS = "ic3t-wcy2";

async function fetchJSON(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Failed to fetch ${url}: ${res.status}`);
      return [];
    }
    return await res.json();
  } catch (e) {
    console.error(`Error fetching ${url}:`, e);
    return [];
  }
}

async function lookupBINByAddress(address: string): Promise<string | null> {
  // Use DOB violations dataset to reverse-lookup BIN from address
  const encoded = encodeURIComponent(address.toUpperCase());
  const url = `${NYC_DATA_BASE}/${DOB_VIOLATIONS}.json?$where=upper(house__)%20||%20%27%20%27%20||%20upper(street)%20like%20%27%25${encoded}%25%27&$limit=1&$select=bin`;
  const data = await fetchJSON(url);
  if (data.length > 0 && data[0].bin) {
    return data[0].bin;
  }
  // Try permits dataset
  const url2 = `${NYC_DATA_BASE}/${DOB_PERMITS}.json?$where=upper(house__)%20||%20%27%20%27%20||%20upper(street_name)%20like%20%27%25${encoded}%25%27&$limit=1&$select=bin__`;
  const data2 = await fetchJSON(url2);
  if (data2.length > 0 && data2[0].bin__) {
    return data2[0].bin__;
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bin, address } = await req.json();
    let resolvedBin = bin;

    if (!resolvedBin && address) {
      resolvedBin = await lookupBINByAddress(address);
      if (!resolvedBin) {
        return new Response(JSON.stringify({ error: "Could not find a BIN for that address. Try searching by BIN directly." }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (!resolvedBin) {
      return new Response(JSON.stringify({ error: "Please provide a BIN or address." }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch all sources in parallel
    const [dobViolations, ecbViolations, hpdViolations, permits] = await Promise.all([
      fetchJSON(`${NYC_DATA_BASE}/${DOB_VIOLATIONS}.json?bin=${resolvedBin}&$limit=500`),
      fetchJSON(`${NYC_DATA_BASE}/${DOB_ECB_VIOLATIONS}.json?bin=${resolvedBin}&$limit=500`),
      fetchJSON(`${NYC_DATA_BASE}/${HPD_VIOLATIONS}.json?boroid=${resolvedBin.charAt(0)}&block=${resolvedBin.substring(1,6)}&$limit=500`),
      fetchJSON(`${NYC_DATA_BASE}/${DOB_PERMITS}.json?bin__=${resolvedBin}&$limit=500`),
    ]);

    // Extract property info from first available record
    let propertyAddress = address || "";
    let borough = "";
    let block = "";
    let lot = "";

    if (dobViolations.length > 0) {
      const v = dobViolations[0];
      propertyAddress = propertyAddress || `${v.house__ || ''} ${v.street || ''}`.trim();
      borough = v.boro || "";
      block = v.block || "";
      lot = v.lot || "";
    } else if (permits.length > 0) {
      const p = permits[0];
      propertyAddress = propertyAddress || `${p.house__ || ''} ${p.street_name || ''}`.trim();
      borough = p.borough || "";
      block = p.block || "";
      lot = p.lot || "";
    }

    const result = {
      bin: resolvedBin,
      address: propertyAddress,
      borough,
      block,
      lot,
      dobViolations: dobViolations.map((v: any) => ({
        isn_dob_bis_viol: v.isn_dob_bis_viol || v.violation_number || '',
        violation_type: v.violation_type || '',
        violation_category: v.violation_category || '',
        violation_type_code: v.violation_type_code || '',
        violation_number: v.violation_number || '',
        violation_date: v.issue_date || v.violation_date || '',
        violation_date_closed: v.violation_date_closed || '',
        disposition_date: v.disposition_date || '',
        disposition_comments: v.disposition_comments || '',
        device_type: v.device_type || '',
        description: v.description || v.violation_type || '',
        severity: v.severity || '',
        respondent_name: v.respondent_name || '',
        status: v.disposition_comments?.toLowerCase()?.includes('dismiss') ? 'Closed' : (v.violation_date_closed ? 'Closed' : 'Active'),
      })),
      ecbViolations: ecbViolations.map((v: any) => ({
        isn_dob_bis_viol: v.isn_dob_bis_viol || '',
        ecb_violation_number: v.ecb_violation_number || '',
        ecb_violation_status: v.ecb_violation_status || '',
        violation_type: v.violation_type || '',
        violation_description: v.violation_description || '',
        penalty_balance_due: v.penalty_applied || v.penality_imposed || '0',
        amount_paid: v.amount_paid || '0',
        amount_baldue: v.amount_baldue || v.penalty_applied || '0',
        infraction_codes: v.infraction_code1 || '',
        violation_date: v.issue_date || v.served_date || '',
        hearing_date_time: v.hearing_date_time || '',
        hearing_result: v.hearing_result || '',
        issuing_office: v.issuing_office || '',
        respondent_name: v.respondent_name || '',
        severity: v.severity || '',
        status: v.ecb_violation_status || 'Unknown',
      })),
      hpdViolations: hpdViolations.map((v: any) => ({
        violationid: v.violationid || '',
        boroid: v.boroid || '',
        block: v.block || '',
        lot: v.lot || '',
        class: v.class || v.nov_type || '',
        inspectiondate: v.inspectiondate || '',
        approveddate: v.approveddate || '',
        originalcertifybydate: v.originalcertifybydate || '',
        originalcorrectbydate: v.originalcorrectbydate || '',
        newcertifybydate: v.newcertifybydate || '',
        newcorrectbydate: v.newcorrectbydate || '',
        certifieddate: v.certifieddate || '',
        ordernumber: v.ordernumber || '',
        novid: v.novid || '',
        novdescription: v.novdescription || '',
        novissueddate: v.novissueddate || '',
        currentstatusid: v.currentstatusid || '',
        currentstatus: v.currentstatus || '',
        currentstatusdate: v.currentstatusdate || '',
        violationstatus: v.violationstatus || '',
      })),
      permits: permits.map((p: any) => ({
        job__: p.job__ || '',
        job_type: p.job_type || '',
        job_status: p.job_status || '',
        job_status_descrp: p.job_status_descrp || '',
        filing_date: p.filing_date || '',
        filing_status: p.filing_status || '',
        permit_type: p.permit_type || '',
        permit_status: p.permit_status || '',
        permit_status_date: p.permit_status_date || '',
        work_type: p.work_type || '',
        applicant_s_first_name: p.applicant_s_first_name || '',
        applicant_s_last_name: p.applicant_s_last_name || '',
        owner_s_first_name: p.owner_s_first_name || '',
        owner_s_last_name: p.owner_s_last_name || '',
        borough: p.borough || '',
        block: p.block || '',
        lot: p.lot || '',
        bin__: p.bin__ || '',
      })),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error("Error in search-property:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
