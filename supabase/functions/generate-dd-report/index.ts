// DD Report Generator - Uses GeoSearch for address lookup
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NYC_ENDPOINTS = {
  PLUTO: "https://data.cityofnewyork.us/resource/64uk-42ks.json",
  DOB_JOBS: "https://data.cityofnewyork.us/resource/ic3t-wcy2.json",
  DOB_VIOLATIONS: "https://data.cityofnewyork.us/resource/3h2n-5cm9.json",
  ECB_VIOLATIONS: "https://data.cityofnewyork.us/resource/6bgk-3dad.json",
  HPD_VIOLATIONS: "https://data.cityofnewyork.us/resource/wvxf-dwi5.json",
  DOB_NOW: "https://data.cityofnewyork.us/resource/rbx6-tga4.json",
  GEOSEARCH: "https://geosearch.planninglabs.nyc/v2/search",
  OATH_HEARINGS: "https://data.cityofnewyork.us/resource/jz4z-kudi.json",
};

const BOROUGH_CODES: Record<string, string> = {
  "MANHATTAN": "1", "MN": "1", "NEW YORK": "1",
  "BRONX": "2", "BX": "2", "THE BRONX": "2",
  "BROOKLYN": "3", "BK": "3", "KINGS": "3",
  "QUEENS": "4", "QN": "4",
  "STATEN ISLAND": "5", "SI": "5", "RICHMOND": "5",
};

const NYC_APP_TOKEN = Deno.env.get("NYC_APP_TOKEN") || "";

async function fetchNYCData(endpoint: string, params: Record<string, string>): Promise<any[]> {
  const url = new URL(endpoint);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  if (NYC_APP_TOKEN) url.searchParams.set("$$app_token", NYC_APP_TOKEN);
  try {
    console.log(`Fetching: ${url.toString()}`);
    const response = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`NYC API error ${response.status}: ${errorText.substring(0, 200)}`);
      return [];
    }
    const data = await response.json();
    console.log(`Got ${Array.isArray(data) ? data.length : 'non-array'} results`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error(`Error fetching from ${endpoint}:`, error);
    return [];
  }
}

async function geoSearchAddress(address: string): Promise<{ bin: string; bbl: string; label: string } | null> {
  try {
    const url = new URL(NYC_ENDPOINTS.GEOSEARCH);
    url.searchParams.set('text', address);
    console.log(`GeoSearch: ${url.toString()}`);
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.features || data.features.length === 0) return null;
    const props = data.features[0].properties || {};
    const bin = props.pad_bin || props.addendum?.pad?.bin || '';
    const bbl = props.pad_bbl || props.addendum?.pad?.bbl || '';
    return { bin: bin.toString(), bbl: bbl.toString(), label: props.label || address };
  } catch (error) {
    console.error('GeoSearch error:', error);
    return null;
  }
}

function parseAddress(address: string): { houseNumber: string; streetName: string; borough: string; boroughCode: string } | null {
  const normalized = address.toUpperCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  let borough = "";
  let boroughCode = "";
  let addressWithoutBorough = normalized;
  for (const [name, code] of Object.entries(BOROUGH_CODES)) {
    if (normalized.includes(name)) {
      borough = name;
      boroughCode = code;
      addressWithoutBorough = normalized.replace(new RegExp(`\\s*${name}\\s*(NY)?\\s*(\\d{5})?\\s*$`, 'i'), '').trim();
      break;
    }
  }
  const match = addressWithoutBorough.match(/^(\d+[-\d]*)\s+(.+)$/);
  if (!match) return null;
  return { houseNumber: match[1], streetName: match[2].trim(), borough, boroughCode };
}

async function lookupBINFromDOBJobs(houseNumber: string, streetName: string, borough: string): Promise<{ bin: string; bbl: string } | null> {
  const cleanStreet = streetName.toUpperCase().replace(/\bAVENUE\b/g, 'AVE').replace(/\bSTREET\b/g, 'ST').replace(/\bBOULEVARD\b/g, 'BLVD').trim();
  const results = await fetchNYCData(NYC_ENDPOINTS.DOB_JOBS, {
    "$where": `house__ LIKE '%${houseNumber}%' AND upper(street_name) LIKE '%${cleanStreet.split(' ')[0]}%' AND upper(borough) LIKE '%${borough}%'`,
    "$limit": "5",
    "$order": "latest_action_date DESC",
  });
  if (results.length > 0) {
    const r = results[0];
    const boroughCode = BOROUGH_CODES[borough.toUpperCase()] || '1';
    const block = (r.block || '').toString().padStart(5, '0');
    const lot = (r.lot || '').toString().padStart(4, '0');
    return { bin: r.bin__ || r.gis_bin || '', bbl: `${boroughCode}${block}${lot}` };
  }
  return null;
}

async function fetchPLUTOData(bbl: string): Promise<any> {
  const cleanBbl = bbl.replace(/\D/g, '');
  if (!cleanBbl || cleanBbl.length < 10) return null;
  const results = await fetchNYCData(NYC_ENDPOINTS.PLUTO, { "bbl": cleanBbl, "$limit": "1" });
  if (results.length === 0) return null;
  const p = results[0];
  return {
    bin: p.bin || null, bbl: cleanBbl, address: p.address || null, borough: p.borough || null,
    year_built: p.yearbuilt ? parseInt(p.yearbuilt) : null, stories: p.numfloors ? parseInt(p.numfloors) : null,
    dwelling_units: p.unitsres ? parseInt(p.unitsres) : null, lot_area_sqft: p.lotarea ? parseInt(p.lotarea) : null,
    building_area_sqft: p.bldgarea ? parseInt(p.bldgarea) : null, zoning_district: p.zonedist1 || null,
    building_class: p.bldgclass || null, land_use: p.landuse || null, owner_name: p.ownername || null,
    assessed_total_value: p.assesstot ? parseFloat(p.assesstot) : null,
    is_landmark: p.landmark === 'Y', historic_district: p.histdist || null,
  };
}

// Maps borough code (1-5) to full borough name used by OATH dataset
const OATH_BOROUGH_NAMES: Record<string, string> = {
  "1": "MANHATTAN",
  "2": "BRONX",
  "3": "BROOKLYN",
  "4": "QUEENS",
  "5": "STATEN ISLAND",
};

// Maps agency code to OATH issuing_agency name
const OATH_AGENCIES: Array<{ code: string; oathName: string }> = [
  { code: "FDNY", oathName: "FIRE DEPARTMENT OF NYC" },
  { code: "DEP",  oathName: "DEPT OF ENVIRONMENT PROT" },
  { code: "DOT",  oathName: "DEPT OF TRANSPORTATION" },
  { code: "DSNY", oathName: "DEPT OF SANITATION" },
  { code: "LPC",  oathName: "LANDMARKS PRESERV COMM" },
  { code: "DOF",  oathName: "DEPT OF FINANCE" },
];

const OATH_RESOLVED_TERMS = ["paid", "written off", "dismissed", "defaulted", "satisfied", "complied", "waived"];

async function fetchOATHViolations(bbl: string, agencyCode: string, oathAgencyName: string): Promise<any[]> {
  if (!bbl || bbl.length < 10) return [];
  const boroughCode = bbl.slice(0, 1);
  const block = bbl.slice(1, 6); // keep leading zeros for OATH
  const lot = bbl.slice(6, 10);  // keep leading zeros for OATH
  const boroughName = OATH_BOROUGH_NAMES[boroughCode];
  if (!boroughName) return [];

  const params: Record<string, string> = {
    "issuing_agency": oathAgencyName,
    "violation_location_borough": boroughName,
    "violation_location_block_no": block,
    "violation_location_lot_no": lot,
    "$limit": "100",
    "$order": "violation_date DESC",
  };

  const records = await fetchNYCData(NYC_ENDPOINTS.OATH_HEARINGS, params);
  return records.map((r: any) => {
    const hearingStatus = (r.hearing_status || '').toLowerCase();
    const hearingResult = (r.hearing_result || '').toLowerCase();
    const complianceStatus = (r.compliance_status || '').toLowerCase();
    const combined = `${hearingStatus} ${hearingResult} ${complianceStatus}`;
    const isResolved = OATH_RESOLVED_TERMS.some(term => combined.includes(term));

    const desc1 = r.charge_1_code_description || '';
    const desc2 = r.charge_2_code_description || '';
    const descRaw = [desc1, desc2].filter(Boolean).join('; ') || r.violation_description || null;

    const penalty = r.penalty_imposed ? parseFloat(r.penalty_imposed) : (r.total_violation_amount ? parseFloat(r.total_violation_amount) : null);

    return {
      id: r.ticket_number || r.respondent_ticket_number || `${agencyCode}-${Math.random()}`,
      agency: agencyCode,
      violation_number: r.ticket_number || null,
      violation_type: r.charge_1_code_description || null,
      violation_class: null,
      description_raw: descRaw,
      issued_date: r.violation_date || null,
      severity: null,
      status: isResolved ? "closed" : "open",
      penalty_amount: isNaN(penalty!) ? null : penalty,
      hearing_date: r.hearing_date || null,
      respondent_name: [r.respondent_first_name, r.respondent_last_name].filter(Boolean).join(' ') || null,
      is_stop_work_order: false,
      is_partial_stop_work: false,
      is_vacate_order: false,
    };
  });
}

async function fetchViolations(bin: string, bbl: string): Promise<any[]> {
  const violations: any[] = [];
  if (bin) {
    const dobViolations = await fetchNYCData(NYC_ENDPOINTS.DOB_VIOLATIONS, {
      "bin": bin, "$where": "disposition_date IS NULL", "$limit": "200", "$order": "issue_date DESC",
    });
    violations.push(...dobViolations.map((v: any) => {
      const vt = (v.violation_type || '').toLowerCase();
      const desc = (v.description || '').toLowerCase();
      return {
        id: v.isn_dob_bis_viol || v.number, agency: "DOB",
        violation_number: v.isn_dob_bis_viol || v.number, violation_type: v.violation_type || null,
        violation_class: v.violation_category || null, description_raw: v.description || v.violation_type_code || null,
        issued_date: v.issue_date || null, severity: v.violation_category || null, status: "open",
        is_stop_work_order: vt.includes('stop work') || desc.includes('stop work') || desc.includes('stop all work'),
        is_partial_stop_work: vt.includes('partial stop work') || desc.includes('partial stop work'),
        is_vacate_order: vt.includes('vacate') || desc.includes('vacate order'),
        disposition: v.disposition_comments || null,
      };
    }));

    const ecbViolations = await fetchNYCData(NYC_ENDPOINTS.ECB_VIOLATIONS, {
      "bin": bin, "$where": "ecb_violation_status != 'RESOLVE'", "$limit": "200", "$order": "issue_date DESC",
    });
    violations.push(...ecbViolations.map((v: any) => ({
      id: v.ecb_violation_number, agency: "ECB",
      violation_number: v.ecb_violation_number, violation_type: v.infraction_code1 || null,
      violation_class: v.violation_type || null, description_raw: v.violation_description || null,
      issued_date: v.issue_date || null, severity: v.severity || null,
      status: (v.ecb_violation_status || 'open').toLowerCase(),
      penalty_amount: v.penality_imposed ? parseFloat(v.penality_imposed) : null,
      hearing_date: v.hearing_date || null,
    })));
  }

  if (bbl && bbl.length >= 10) {
    const borough = bbl.slice(0, 1);
    const block = bbl.slice(1, 6).replace(/^0+/, '') || '0';
    const lot = bbl.slice(6, 10).replace(/^0+/, '') || '0';
    const hpdViolations = await fetchNYCData(NYC_ENDPOINTS.HPD_VIOLATIONS, {
      "boroid": borough, "block": block, "lot": lot,
      "$where": "violationstatus = 'Open'", "$limit": "200", "$order": "inspectiondate DESC",
    });
    violations.push(...hpdViolations.map((v: any) => {
      const desc = (v.novdescription || '').toLowerCase();
      return {
        id: v.violationid, agency: "HPD",
        violation_number: v.violationid?.toString() || null, violation_type: v.novdescription?.slice(0, 50) || null,
        violation_class: v.class || null, description_raw: v.novdescription || null,
        issued_date: v.inspectiondate || v.novissueddate || null, severity: v.class || null, status: "open",
        apartment: v.apartment || null, story: v.story || null,
        is_vacate_order: desc.includes('vacate'), is_stop_work_order: false, is_partial_stop_work: false,
      };
    }));

    // Fetch OATH violations for all 6 agencies in parallel
    const oathResults = await Promise.all(
      OATH_AGENCIES.map(({ code, oathName }) => fetchOATHViolations(bbl, code, oathName))
    );
    for (const agencyViolations of oathResults) {
      violations.push(...agencyViolations);
    }
  }
  return violations;
}

const EXCLUDED_STATUS_CODES = ['X']; // X = Withdrawn — keep U (Updated) and I (In Process)
const EXCLUDED_STATUS_NAMES = ['signed off', 'signed-off', 'signoff', 'sign-off', 'completed', 'permit entire'];

function shouldExcludeApplication(status: string | null, statusCode?: string | null): boolean {
  const statusLower = (status || '').toLowerCase().trim();
  const codeUpper = (statusCode || '').toUpperCase().trim();
  if (codeUpper && EXCLUDED_STATUS_CODES.includes(codeUpper)) return true;
  return EXCLUDED_STATUS_NAMES.some((excluded) => statusLower.includes(excluded));
}

function extractFloorAptFromDescription(description: string | null): { floor: string | null; apartment: string | null } {
  if (!description) return { floor: null, apartment: null };
  const desc = description.toUpperCase();
  let floor: string | null = null;
  let apartment: string | null = null;
  const floorPatterns = [
    /FLOORS?\s*(\d+(?:\s*[-,&]\s*\d+)*(?:\s*(?:THRU|TO|AND)\s*\d+)?)/i,
    /(\d+)(?:ST|ND|RD|TH)\s+FL(?:OOR|R)?/i,
    /FL(?:OOR|R)?\s*[:#]?\s*(\d+(?:\s*[-,&]\s*\d+)*)/i,
    /(CELLAR|BASEMENT|BSMT|CEL)/i,
    /(ROOF)/i,
  ];
  for (const pattern of floorPatterns) {
    const match = desc.match(pattern);
    if (match) { floor = match[1]?.trim() || match[0]?.trim(); break; }
  }
  const aptPatterns = [/APT\.?\s*[:#]?\s*(\w+)/i, /UNIT\s*[:#]?\s*(\w+)/i];
  for (const pattern of aptPatterns) {
    const match = desc.match(pattern);
    if (match) { apartment = match[1]?.trim(); break; }
  }
  return { floor, apartment };
}

// Scrape BIS website for job filings (fallback for older records not in Open Data)
async function fetchBISJobsFromWebsite(bin: string): Promise<any[]> {
  try {
    const url = `https://a810-bisweb.nyc.gov/bisweb/JobsQueryByLocationServlet?allbin=${bin}&allpermession=T`;
    console.log(`BIS web scrape: ${url}`);
    const response = await fetch(url);
    if (!response.ok) { console.error(`BIS web scrape failed: ${response.status}`); return []; }
    const html = await response.text();

    // Parse job data from HTML comments which contain structured arrays
    const jobs: any[] = [];
    // Match the Lines array entries in HTML comments
    const linesMatch = html.match(/Lines\s*::\s*ARRAY\[22\s*\*\s*\d+\]\s*([\s\S]*?)-->/);
    if (!linesMatch) { console.log("BIS web scrape: no Lines array found"); return []; }

    const linesBlock = linesMatch[1];
    // Split into individual record blocks [N]
    const recordBlocks = linesBlock.split(/\[\d+\]/).filter(b => b.trim());

    for (const block of recordBlocks) {
      const fields: Record<string, string> = {};
      const fieldMatches = block.matchAll(/\[\d+:(\w+)\]\{([^}]*)\}/g);
      for (const m of fieldMatches) {
        fields[m[1]] = m[2].trim();
      }
      if (!fields.Job) continue; // skip empty records

      // Parse date from MMDDYYYY format
      const fd = fields.Fd || '';
      const filingDate = fd.length === 8 ? `${fd.slice(0,2)}/${fd.slice(2,4)}/${fd.slice(4,8)}` : null;
      const dt = fields.Dt || '';
      const statusDate = dt.length === 8 ? `${dt.slice(0,2)}/${dt.slice(2,4)}/${dt.slice(4,8)}` : null;

      // Map single-char status code to description
      const statusCode = fields.Js || '';
      const statusDesc = fields.Jobstatus || statusCode;

      jobs.push({
        id: fields.Job,
        source: "BIS",
        application_number: fields.Job,
        application_type: fields.JobType || null,
        work_type: null,
        job_description: fields.Jobdes || null,
        status: statusDesc,
        status_code: statusCode,
        status_description: statusDesc,
        filing_date: filingDate,
        latest_action_date: statusDate,
        estimated_cost: null,
        floor: fields.FlrInjq || null,
        apartment: null,
        owner_name: null,
        filing_professional_name: fields.Applicant || null,
        doc_type: fields.DocType || null,
        doc_number: fields.Ap || null,
        bis_scraped: true,
      });
    }

    console.log(`BIS web scrape: found ${jobs.length} raw records`);

    // Group by job number and keep only the primary document (prefer "01" over PAA/other doc types)
    const jobMap = new Map<string, any>();
    for (const job of jobs) {
      const jobNum = job.application_number;
      if (!jobNum) continue;
      const existing = jobMap.get(jobNum);
      if (!existing) {
        jobMap.set(jobNum, job);
      } else {
        // Prefer doc_type "01" (the actual filing) over PAA or other types
        const existingDoc = (existing.doc_type || '').toUpperCase();
        const newDoc = (job.doc_type || '').toUpperCase();
        if (newDoc === '01' && existingDoc !== '01') {
          jobMap.set(jobNum, job);
        }
      }
    }
    const deduped = Array.from(jobMap.values());
    console.log(`BIS web scrape: ${deduped.length} unique jobs after dedup`);
    return deduped;
  } catch (error) {
    console.error("BIS web scrape error:", error);
    return [];
  }
}

async function fetchApplications(bin: string): Promise<any[]> {
  const applications: any[] = [];
  if (!bin) return applications;

  // Fetch from Open Data API first
  const dobJobs = await fetchNYCData(NYC_ENDPOINTS.DOB_JOBS, {
    "bin__": bin, "$limit": "200", "$order": "latest_action_date DESC",
  });

  let bisApps = dobJobs.map((j: any) => {
    let floor = j.work_on_floors__ || j.bldg_floor || null;
    let apartment = j.apt_condonos || null;
    if (!floor && j.job_description) {
      const extracted = extractFloorAptFromDescription(j.job_description);
      if (extracted.floor) floor = extracted.floor;
      if (!apartment && extracted.apartment) apartment = extracted.apartment;
    }
    return {
      id: j.job__, source: "BIS", application_number: j.job__,
      application_type: j.job_type || null, work_type: j.work_type || null,
      job_description: j.job_description || null, status: j.job_status || null,
      status_code: j.job_status_code || null, status_description: j.job_status_descrp || null,
      filing_date: j.pre__filing_date || j.filing_date || null,
      latest_action_date: j.latest_action_date || null,
      estimated_cost: j.initial_cost ? parseFloat(j.initial_cost) : null,
      floor, apartment,
      owner_name: j.owner_s_first_name && j.owner_s_last_name ? `${j.owner_s_first_name} ${j.owner_s_last_name}` : j.owner_s_business_name || null,
      filing_professional_name: j.applicant_s_first_name && j.applicant_s_last_name ? `${j.applicant_s_first_name} ${j.applicant_s_last_name}` : null,
    };
  }).filter((app: any) => !shouldExcludeApplication(app.status, app.status_code));

  // If Open Data returned no BIS jobs, fall back to BIS website scraping
  if (bisApps.length === 0) {
    console.log("Open Data returned 0 BIS jobs, falling back to BIS website scrape...");
    const scrapedJobs = await fetchBISJobsFromWebsite(bin);
    bisApps = scrapedJobs.filter((app: any) => !shouldExcludeApplication(app.status, app.status_code));
  } else {
    // Even if Open Data has some results, scrape BIS to find older jobs not in Open Data
    const scrapedJobs = await fetchBISJobsFromWebsite(bin);
    const existingJobNums = new Set(bisApps.map((a: any) => a.application_number));
    const additionalJobs = scrapedJobs
      .filter((j: any) => !existingJobNums.has(j.application_number))
      .filter((app: any) => !shouldExcludeApplication(app.status, app.status_code));
    if (additionalJobs.length > 0) {
      console.log(`Found ${additionalJobs.length} additional BIS jobs from web scrape`);
      bisApps.push(...additionalJobs);
    }
  }
  applications.push(...bisApps);

  const dobNowApps = await fetchNYCData(NYC_ENDPOINTS.DOB_NOW, { "bin": bin, "$limit": "200" });
  const nowApps = dobNowApps.map((a: any) => ({
    id: a.job_filing_number || a.filing_number, source: "DOB_NOW",
    application_number: a.job_filing_number || a.filing_number,
    application_type: a.job_type || a.filing_type || null, work_type: a.work_type || null,
    job_description: a.job_description || null, status: a.filing_status || a.current_status || null,
    filing_date: a.filing_date || null, floor: a.work_on_floor || null, apartment: a.apt_condo_no_s || null,
    applicant_name: a.applicant_first_name && a.applicant_last_name ? `${a.applicant_first_name} ${a.applicant_last_name}` : a.applicant_business_name || null,
    applicant_first_name: a.applicant_first_name || null, applicant_last_name: a.applicant_last_name || null,
    applicant_business_name: a.applicant_business_name || null,
    approved_date: a.approved_date || null, issued_date: a.issued_date || null,
    permit_status: a.permit_status || null, filing_reason: a.filing_reason || null,
  })).filter((app: any) => !shouldExcludeApplication(app.status, null));
  applications.push(...nowApps);

  return applications;
}

async function generateLineItemNotes(
  violations: any[],
  applications: any[],
  address: string,
  customerConcern: string | null,
  LOVABLE_API_KEY: string
): Promise<any[]> {
  // Build compact item list for AI — include penalty/status data for severity guidance
  const violationItems = violations.slice(0, 60).map((v: any) => ({
    type: "violation",
    id: v.violation_number || v.id,
    agency: v.agency,
    desc: (v.violation_type || v.description_raw || 'Unknown').slice(0, 120),
    floor: v.story || null,
    apt: v.apartment || null,
    status: v.violation_status || v.status || null,
    penalty_amount: v.penalty_amount || v.penalty_imposed || null,
    hearing_status: v.hearing_status || null,
    class: v.nov_class || v.class_value || null,
  }));

  const applicationItems = applications.slice(0, 40).map((a: any) => ({
    type: "application",
    id: `${a.source || 'BIS'}-${a.application_number || a.id}`,
    source: a.source,
    desc: (a.job_description || a.application_type || 'Unknown').slice(0, 120),
    floor: a.floor || null,
    apt: a.apartment || null,
    status: a.permit_status || a.application_status || a.status || null,
  }));

  const allItems = [...violationItems, ...applicationItems];
  if (allItems.length === 0) return [];

  const concernInstruction = customerConcern
    ? `The client's specific question is: "${customerConcern}"

Each note MUST assess whether this item is relevant to that question.
If the item clearly cannot affect the client's concern (e.g., it is on a different floor, different system, or already resolved), say so briefly.
If it IS relevant or potentially relevant, explain the specific risk or implication in plain professional language.`
    : `No specific concern was provided. Write a general professional impact note for each item, focusing on open issues, outstanding balances, and unresolved compliance status.`;

  const prompt = `PROPERTY: ${address}
BIN: ${allItems[0]?.bin || 'see data'} | Reviewing ${allItems.length} items

${concernInstruction}

━━━ YOUR TASK ━━━
For EACH item in the JSON below, write ONE professional note of 1-2 sentences (20-30 words) suitable for a transactional due diligence report read by real estate attorneys.

━━━ FORMAT RULES ━━━
Start every note with exactly one of these prefixes:
  [ACTION REQUIRED] — open issue needing attorney attention before closing
  [MONITOR] — not immediately blocking but should be tracked
  [RESOLVED] — confirmed closed/paid/dismissed, no action needed
  [INFO] — informational only, no compliance concern

After the prefix: one clause identifying what the item is, one clause on status/impact.
If floor/apt data is present in the item, include it in the identification clause.
Be declarative: "This violation is open with a $2,400 balance due." — not "may have" or "could indicate."

━━━ SEVERITY LOGIC — APPLY STRICTLY ━━━

ECB Violations:
- status=open AND penalty_amount > 0 → [ACTION REQUIRED]. State the exact dollar amount.
- status=open AND penalty_amount null/0 → [MONITOR] open enforcement hearing.
- hearing_result contains "DEFAULT" → [ACTION REQUIRED] — respondent did not appear; default judgment likely entered. Requires attorney follow-up before closing.
- status=closed/dismissed/paid → [RESOLVED]

DOB Violations:
- is_stop_work_order=true → [ACTION REQUIRED]. Stop Work Order on record. Cannot close title with active SWO on most transactions.
- is_partial_stop_work=true → [ACTION REQUIRED]. Partial Stop Work Order; scope may be limited but requires cure.
- is_vacate_order=true → [ACTION REQUIRED]. Vacate Order on record. Blocks occupancy; must be lifted before any transaction.
- description contains "unsafe", "hazardous", "emergency" → [ACTION REQUIRED]
- All other open DOB violations → [MONITOR]
- Closed/disposition present → [RESOLVED]

HPD Violations:
- class=C (Immediately Hazardous) → [ACTION REQUIRED] regardless of concern. Class C must be corrected within 24 hours of issuance.
- class=B (Hazardous, open) → [ACTION REQUIRED] if open.
- class=A (Non-hazardous) → [INFO] if old; [MONITOR] if recent.
- status contains "Close" or "Certify" → [RESOLVED]

FDNY / DSNY / DOT / LPC / DOF / DEP (OATH violations):
- status=open AND penalty_amount > 0 → [ACTION REQUIRED]. State amount and agency.
- status=open, no penalty → [MONITOR]
- status=closed → [RESOLVED]

Permit Applications (BIS/DOB NOW):
- status=PARTIAL → [MONITOR]. Work was only partially permitted — indicates incomplete scope, phased work, or a stalled project. Assess relevance to concern.
- status=IN PROGRESS or PENDING → [MONITOR]. Active filing; work may be ongoing.
- job_description mentions FAÇADE, ELEVATOR, GAS, BOILER, SPRINKLER, PLUMBING, ELECTRICAL → these are building-wide systems; flag if open.
- Resolved/signed-off → These should not appear; if present, use [INFO].

━━━ CONCERN-SPECIFIC GUIDANCE ━━━
If concern mentions a specific unit (e.g., "Unit 4B"): compare item floor/apt against concern. If item is on a clearly different floor and is NOT a building-wide system (elevator, facade, gas, boiler), note: "Located on [floor], not directly related to [unit in concern]." Use [INFO].
If concern mentions "combination" or "merging": flag any active alteration jobs on relevant floors.
If concern mentions "purchase" or "acquisition": flag all [ACTION REQUIRED] items as requiring resolution or escrow holdback at closing.
If no concern: treat all open items as potentially relevant; provide balanced general assessment.

━━━ ITEMS TO REVIEW ━━━
${JSON.stringify(allItems, null, 2)}`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a licensed NYC real estate compliance analyst and paralegal specialist with 15 years of experience reviewing DOB, ECB, HPD, FDNY, DSNY, DOT, LPC, and DOF records for transactional due diligence. Your notes are read by real estate attorneys, title companies, and sophisticated investors. Be precise, professional, and attorney-ready. Return structured JSON via the tool call." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "save_line_item_notes",
            description: "Save the generated notes for each violation and application.",
            parameters: {
              type: "object",
              properties: {
                notes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      item_type: { type: "string", enum: ["violation", "application"] },
                      item_id: { type: "string" },
                      note: { type: "string" },
                    },
                    required: ["item_type", "item_id", "note"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["notes"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "save_line_item_notes" } },
      }),
    });

    if (!response.ok) {
      console.error("AI line-item notes error:", response.status);
      return [];
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return parsed.notes || [];
    }
    return [];
  } catch (error) {
    console.error("AI line-item notes generation error:", error);
    return [];
  }
}

async function generateAIAnalysis(reportData: any, customerConcern: string | null, LOVABLE_API_KEY: string): Promise<string> {
  const { building, violations, applications, orders } = reportData;
  const openViolations = violations.filter((v: any) => v.status === 'open');
  const dobV = openViolations.filter((v: any) => v.agency === 'DOB');
  const ecbV = openViolations.filter((v: any) => v.agency === 'ECB');
  const hpdV = openViolations.filter((v: any) => v.agency === 'HPD');

  const concernSection = customerConcern
    ? `\n\nCUSTOMER CONCERN: "${customerConcern}"\nPlease specifically address this concern in your analysis and conclusion.`
    : '';

  const prompt = `You are a professional real estate due diligence analyst. Analyze this NYC property data and provide a comprehensive risk assessment.

PROPERTY: ${building?.address || 'Unknown'} | BIN: ${building?.bin || 'Unknown'} | BBL: ${building?.bbl || 'Unknown'}
Year Built: ${building?.year_built || 'Unknown'} | Stories: ${building?.stories || 'Unknown'} | Units: ${building?.dwelling_units || 'Unknown'}
Zoning: ${building?.zoning_district || 'Unknown'} | Landmark: ${building?.is_landmark ? 'Yes' : 'No'} | Owner: ${building?.owner_name || 'Unknown'}

VIOLATIONS: ${openViolations.length} total (DOB: ${dobV.length}, ECB: ${ecbV.length}, HPD: ${hpdV.length})
Stop Work Orders: ${orders.stop_work?.length || 0} | Vacate Orders: ${orders.vacate?.length || 0}

RECENT: ${openViolations.slice(0, 10).map((v: any) => `[${v.agency}] ${v.violation_type || v.description_raw || 'Unknown'}`).join('; ') || 'None'}

APPLICATIONS: ${applications.length} total
${applications.slice(0, 5).map((a: any) => `[${a.source}] ${a.application_type || 'Unknown'} - ${a.status || 'Unknown'}`).join('; ') || 'None'}
${concernSection}

Provide: 1. Risk Level (Low/Medium/High/Critical) 2. Key Findings 3. Violation Analysis 4. Permit Activity 5. Recommendations${customerConcern ? ' 6. Conclusion addressing the customer concern directly' : ''}`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a professional real estate due diligence analyst for NYC properties. Provide clear, actionable analysis." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) {
      console.error("AI API error:", response.status);
      return "AI analysis could not be generated.";
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "AI analysis unavailable.";
  } catch (error) {
    console.error("AI generation error:", error);
    return "AI analysis could not be generated due to an error.";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getUser(token);
    if (claimsError || !claimsData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = claimsData.user.id;
    const { reportId, address, customerConcern } = await req.json();
    if (!reportId || !address) {
      return new Response(JSON.stringify({ error: "Missing reportId or address" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log(`=== Generating DD report for: ${address} ===`);

    // Set generation_started_at and save customer concern
    await supabase.from('dd_reports').update({
      generation_started_at: new Date().toISOString(),
      ...(customerConcern ? { customer_concern: customerConcern } : {}),
    }).eq('id', reportId);

    if (false) {
      // placeholder to keep structure — customerConcern already saved above
    }

    let bin = '', bbl = '', resolvedAddress = address;
    const geoResult = await geoSearchAddress(address);
    if (geoResult) {
      bin = geoResult.bin; bbl = geoResult.bbl; resolvedAddress = geoResult.label;
    } else {
      const parsed = parseAddress(address);
      if (parsed) {
        const dobResult = await lookupBINFromDOBJobs(parsed.houseNumber, parsed.streetName, parsed.borough);
        if (dobResult) { bin = dobResult.bin; bbl = dobResult.bbl; }
      }
    }

    let building: any = null;
    if (bbl) {
      building = await fetchPLUTOData(bbl);
      if (building) {
        if (!bin && building.bin) bin = building.bin;
        building.address = resolvedAddress;
      }
    }

    if (!bin && !bbl) {
      await supabase.from('dd_reports').update({ status: 'error', ai_analysis: 'Could not find property. Please verify the address includes the borough.' }).eq('id', reportId);
      return new Response(JSON.stringify({ error: "Property not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const violations = await fetchViolations(bin, bbl);
    const rawApplications = await fetchApplications(bin);
    const seenApps = new Set<string>();
    const applications = rawApplications.filter((app: any) => {
      const key = `${app.source || 'BIS'}-${app.application_number}`;
      if (seenApps.has(key)) return false;
      seenApps.add(key);
      return true;
    });

    const orders = {
      stop_work: violations.filter(v => v.is_stop_work_order && !v.is_partial_stop_work),
      partial_stop_work: violations.filter(v => v.is_partial_stop_work),
      vacate: violations.filter(v => v.is_vacate_order),
    };

    // Generate AI analysis and line-item notes in parallel
    const [aiAnalysis, lineItemNotes] = await Promise.all([
      generateAIAnalysis(
        { building: building || { address: resolvedAddress, bin, bbl }, violations, applications, orders },
        customerConcern || null,
        LOVABLE_API_KEY
      ),
      generateLineItemNotes(violations, applications, resolvedAddress, customerConcern || null, LOVABLE_API_KEY),
    ]);

    const { error: updateError } = await supabase.from('dd_reports').update({
      bin: bin || null, bbl: bbl || null,
      building_data: building || { address: resolvedAddress, bin, bbl },
      violations_data: violations, applications_data: applications, orders_data: orders,
      ai_analysis: aiAnalysis,
      line_item_notes: lineItemNotes,
      status: 'pending_review',
    }).eq('id', reportId);

    if (updateError) throw updateError;
    console.log(`=== Report generated successfully with ${lineItemNotes.length} line-item notes ===`);

    // Log AI usage (best-effort — don't fail report if this fails)
    try {
      const totalTokens = 2000; // conservative estimate per report
      await supabase.from('ai_usage_logs').insert({
        feature: 'report_generation',
        model: 'google/gemini-3-flash-preview',
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: totalTokens,
        estimated_cost_usd: 0.000300,
        metadata: { reportId, address },
      });
    } catch (logErr) {
      console.warn('Failed to log AI usage:', logErr);
    }

    return new Response(JSON.stringify({ success: true, bin, bbl, violationsCount: violations.length, applicationsCount: applications.length, notesCount: lineItemNotes.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error generating DD report:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
