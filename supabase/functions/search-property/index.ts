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
const DOB_COMPLAINTS = "82gq-khvr";
const OATH_HEARINGS = "jz4z-kudi";
const PLUTO = "64uk-42ks";

const NYC_APP_TOKEN = Deno.env.get("NYC_APP_TOKEN") || "";

function appendToken(url: string): string {
  if (!NYC_APP_TOKEN) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}$$app_token=${NYC_APP_TOKEN}`;
}

async function fetchJSON(url: string) {
  try {
    const res = await fetch(appendToken(url));
    if (!res.ok) {
      console.error(`Failed to fetch ${url}: ${res.status}`);
      await res.text();
      return [];
    }
    return await res.json();
  } catch (e) {
    console.error(`Error fetching ${url}:`, e);
    return [];
  }
}

// Returns { bin, bbl } from GeoSearch
async function lookupByAddress(address: string): Promise<{ bin: string; bbl: string } | null> {
  const geoUrl = `https://geosearch.planninglabs.nyc/v2/search?text=${encodeURIComponent(address)}&size=1`;
  try {
    const res = await fetch(geoUrl);
    if (!res.ok) { await res.text(); return null; }
    const geo = await res.json();
    const props = geo?.features?.[0]?.properties;
    const bin = props?.addendum?.pad?.bin || props?.pad_bin || "";
    const bbl = props?.addendum?.pad?.bbl || props?.pad_bbl || "";
    if (bin) return { bin: bin.toString(), bbl: bbl.toString() };

    // Fallback: try DOB violations dataset
    const encoded = encodeURIComponent(address.toUpperCase());
    const url = `${NYC_DATA_BASE}/${DOB_VIOLATIONS}.json?$where=upper(house__||' '||street) like '%25${encoded}%25'&$limit=1&$select=bin`;
    const data = await fetchJSON(url);
    if (data.length > 0 && data[0].bin) return { bin: data[0].bin, bbl: "" };
    return null;
  } catch (e) {
    console.error('Address lookup error:', e);
    return null;
  }
}

// Resolve BBL from BIN via PLUTO
async function lookupBBLByBIN(bin: string): Promise<string> {
  const data = await fetchJSON(`${NYC_DATA_BASE}/${PLUTO}.json?bin=${bin}&$limit=1`);
  if (data.length > 0) {
    const bbl = data[0].bbl || "";
    return bbl.toString();
  }
  return "";
}

function parseBBL(bbl: string): { borough: string; block: string; lot: string } {
  const clean = bbl.replace(/\D/g, "");
  if (clean.length < 10) return { borough: "", block: "", lot: "" };
  return {
    borough: clean.charAt(0),
    block: clean.slice(1, 6).replace(/^0+/, "") || "0",
    lot: clean.slice(6, 10).replace(/^0+/, "") || "0",
  };
}

// OATH
const OATH_BOROUGH_NAMES: Record<string, string> = {
  "1": "MANHATTAN", "2": "BRONX", "3": "BROOKLYN", "4": "QUEENS", "5": "STATEN ISLAND",
};
const OATH_AGENCIES = ["FIRE DEPARTMENT OF NYC", "DEPT OF ENVIRONMENT PROT", "DEPT OF TRANSPORTATION", "DEPT OF SANITATION", "LANDMARKS PRESERV COMM", "DEPT OF FINANCE"];
const OATH_AGENCY_CODES: Record<string, string> = {
  "FIRE DEPARTMENT OF NYC": "FDNY", "DEPT OF ENVIRONMENT PROT": "DEP", "DEPT OF TRANSPORTATION": "DOT",
  "DEPT OF SANITATION": "DSNY", "LANDMARKS PRESERV COMM": "LPC", "DEPT OF FINANCE": "DOF",
};
const OATH_RESOLVED = ["paid", "dismissed", "written off", "defaulted", "satisfied", "complied", "waived"];

async function fetchOATH(bbl: string): Promise<any[]> {
  const { borough, block, lot } = parseBBL(bbl);
  const boroughName = OATH_BOROUGH_NAMES[borough];
  if (!boroughName) return [];
  // Keep block/lot with leading zeros for OATH
  const cleanBbl = bbl.replace(/\D/g, "");
  const blockPadded = cleanBbl.slice(1, 6);
  const lotPadded = cleanBbl.slice(6, 10);

  const results = await Promise.all(
    OATH_AGENCIES.map(async (agency) => {
      const url = `${NYC_DATA_BASE}/${OATH_HEARINGS}.json?issuing_agency=${encodeURIComponent(agency)}&violation_location_borough=${encodeURIComponent(boroughName)}&violation_location_block_no=${blockPadded}&violation_location_lot_no=${lotPadded}&$limit=100&$order=violation_date DESC`;
      return fetchJSON(url);
    })
  );

  return results.flat().map((r: any) => {
    const combined = `${(r.hearing_status || "").toLowerCase()} ${(r.hearing_result || "").toLowerCase()} ${(r.compliance_status || "").toLowerCase()}`;
    const isResolved = OATH_RESOLVED.some(t => combined.includes(t));
    return {
      ticket_number: r.ticket_number || "",
      issuing_agency: OATH_AGENCY_CODES[r.issuing_agency] || r.issuing_agency || "",
      violation_date: r.violation_date || "",
      charge_1_code_description: r.charge_1_code_description || "",
      penalty_imposed: r.penalty_imposed || "0",
      hearing_status: r.hearing_status || "",
      hearing_result: r.hearing_result || "",
      status: isResolved ? "closed" : "open",
    };
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bin, address } = await req.json();
    let resolvedBin = bin || "";
    let resolvedBbl = "";

    if (!resolvedBin && address) {
      const result = await lookupByAddress(address);
      if (!result) {
        return new Response(JSON.stringify({ error: "Could not find a BIN for that address. Try searching by BIN directly." }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      resolvedBin = result.bin;
      resolvedBbl = result.bbl;
    }

    if (!resolvedBin) {
      return new Response(JSON.stringify({ error: "Please provide a BIN or address." }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If we have BIN but no BBL, resolve via PLUTO
    if (!resolvedBbl) {
      resolvedBbl = await lookupBBLByBIN(resolvedBin);
    }

    const { borough: hpdBorough, block: hpdBlock, lot: hpdLot } = parseBBL(resolvedBbl);

    // Fetch all sources in parallel
    const hpdQuery = hpdBorough
      ? fetchJSON(`${NYC_DATA_BASE}/${HPD_VIOLATIONS}.json?boroid=${hpdBorough}&block=${hpdBlock}&lot=${hpdLot}&$limit=500`)
      : Promise.resolve([]);

    const oathQuery = resolvedBbl ? fetchOATH(resolvedBbl) : Promise.resolve([]);

    const [dobViolations, ecbViolations, hpdViolations, permits, dobComplaints, oathViolations] = await Promise.all([
      fetchJSON(`${NYC_DATA_BASE}/${DOB_VIOLATIONS}.json?bin=${resolvedBin}&$limit=500`),
      fetchJSON(`${NYC_DATA_BASE}/${DOB_ECB_VIOLATIONS}.json?bin=${resolvedBin}&$limit=500`),
      hpdQuery,
      fetchJSON(`${NYC_DATA_BASE}/${DOB_PERMITS}.json?bin__=${resolvedBin}&$limit=500`),
      fetchJSON(`${NYC_DATA_BASE}/${DOB_COMPLAINTS}.json?bin=${resolvedBin}&$limit=200`),
      oathQuery,
    ]);

    // Extract property info
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
      oathViolations,
      dobComplaints: dobComplaints.map((c: any) => ({
        complaint_number: c.complaint_number || c.complaint_no || '',
        date_entered: c.date_entered || c.dobrundate || '',
        status: c.status || '',
        complaint_category: c.complaint_category || '',
        unit: c.unit || '',
        description: c.description || c.complaint_category || '',
      })),
      permits: permits.map((p: any) => ({
        job__: p.job__ || '',
        job_type: p.job_type || '',
        job_status: p.job_status || '',
        job_status_descrp: p.job_status_descrp || '',
        job_description: p.job_description || '',
        filing_date: p.filing_date || p.pre__filing_date || '',
        filing_status: p.filing_status || '',
        permit_type: p.permit_type || '',
        permit_status: p.permit_status || '',
        permit_status_date: p.permit_status_date || '',
        work_type: p.work_type || '',
        floor: p.work_on_floors__ || p.bldg_floor || '',
        apartment: p.apt_condonos || '',
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
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
