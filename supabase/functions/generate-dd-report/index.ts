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
  DOB_SAFETY_VIOLATIONS: "https://data.cityofnewyork.us/resource/855j-jady.json",
  ECB_VIOLATIONS: "https://data.cityofnewyork.us/resource/6bgk-3dad.json",
  HPD_VIOLATIONS: "https://data.cityofnewyork.us/resource/wvxf-dwi5.json",
  DOB_NOW: "https://data.cityofnewyork.us/resource/rbx6-tga4.json",
  GEOSEARCH: "https://geosearch.planninglabs.nyc/v2/search",
  OATH_HEARINGS: "https://data.cityofnewyork.us/resource/jz4z-kudi.json",
  FDNY_VIOLATIONS: "https://data.cityofnewyork.us/resource/avgm-ztsb.json",
  DOB_COMPLAINTS: "https://data.cityofnewyork.us/resource/eabe-havv.json",
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
  const block = bbl.slice(1, 6);
  const lot = bbl.slice(6, 10);
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
      hearing_result: r.hearing_result || null,
      respondent_name: [r.respondent_first_name, r.respondent_last_name].filter(Boolean).join(' ') || null,
      is_stop_work_order: false,
      is_partial_stop_work: false,
      is_vacate_order: false,
    };
  });
}

async function fetchFDNYViolations(bin: string): Promise<any[]> {
  if (!bin) return [];
  const records = await fetchNYCData(NYC_ENDPOINTS.FDNY_VIOLATIONS, {
    "bin": bin, "$limit": "200", "$order": "inspection_date DESC",
  });
  return records.map((r: any) => {
    const status = (r.status || r.violation_status || '').toLowerCase();
    const isResolved = status.includes('close') || status.includes('resolved') || status.includes('cured') || status.includes('complied');
    return {
      id: r.violation_number || r.issuance_number || `FDNY-${Math.random()}`,
      agency: "FDNY",
      violation_number: r.violation_number || r.issuance_number || null,
      violation_type: r.violation_code_description || r.violation_code || null,
      violation_class: r.violation_category || null,
      description_raw: r.violation_code_description || r.comments || null,
      issued_date: r.inspection_date || r.violation_date || null,
      severity: r.violation_category || null,
      status: isResolved ? "closed" : "open",
      penalty_amount: r.penalty_amount ? parseFloat(r.penalty_amount) : null,
      is_stop_work_order: false,
      is_partial_stop_work: false,
      is_vacate_order: false,
    };
  });
}

async function fetchDOBSafetyViolations(bin: string): Promise<any[]> {
  if (!bin) return [];
  const records = await fetchNYCData(NYC_ENDPOINTS.DOB_SAFETY_VIOLATIONS, {
    "bin": bin, "$limit": "500",
  });
  return records.map((v: any) => {
    const vt = (v.violation_type || '').toLowerCase();
    const desc = (v.description || v.violation_type_description || '').toLowerCase();
    return {
      id: v.isn_dob_bis_viol || v.violation_number || `DOBSAFE-${Math.random()}`,
      agency: "DOB",
      violation_number: v.isn_dob_bis_viol || v.violation_number || null,
      violation_type: v.violation_type || v.violation_type_description || null,
      violation_class: v.violation_category || null,
      description_raw: v.description || v.violation_type_description || v.violation_type || null,
      issued_date: v.issue_date || v.violation_date || null,
      severity: v.violation_category || null,
      status: v.disposition_date ? "closed" : "open",
      is_stop_work_order: vt.includes('stop work') || desc.includes('stop work'),
      is_partial_stop_work: vt.includes('partial stop work') || desc.includes('partial stop work'),
      is_vacate_order: vt.includes('vacate') || desc.includes('vacate order'),
      disposition: v.disposition_comments || null,
    };
  });
}

async function fetchDOBComplaints(bin: string): Promise<any[]> {
  if (!bin) return [];
  const records = await fetchNYCData(NYC_ENDPOINTS.DOB_COMPLAINTS, {
    "bin": bin, "$limit": "200", "$order": "date_entered DESC",
  });
  return records.map((c: any) => ({
    complaint_number: c.complaint_number || '',
    date_entered: c.date_entered || '',
    status: c.status || '',
    complaint_category: c.complaint_category || '',
    unit: c.unit || '',
    disposition_date: c.disposition_date || '',
    disposition_code: c.disposition_code || '',
    inspection_date: c.inspection_date || '',
    description: c.complaint_category || '',
  }));
}

// Deduplicate records by key, keeping the one with more non-null fields
function deduplicateByKey(records: any[], keyFn: (r: any) => string): any[] {
  const seen = new Map<string, any>();
  for (const r of records) {
    const key = keyFn(r);
    if (!key) { seen.set(`_anon_${Math.random()}`, r); continue; }
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, r);
    } else {
      const existingFields = Object.values(existing).filter(val => val != null && val !== '').length;
      const newFields = Object.values(r).filter(val => val != null && val !== '').length;
      if (newFields > existingFields) seen.set(key, r);
    }
  }
  return Array.from(seen.values());
}

async function fetchViolations(bin: string, bbl: string): Promise<any[]> {
  const violations: any[] = [];

  if (bin) {
    // Fetch DOB BIS violations, DOB Safety violations, and FDNY violations in parallel
    const [dobViolationsRaw, dobSafetyRaw, fdnyDirect] = await Promise.all([
      fetchNYCData(NYC_ENDPOINTS.DOB_VIOLATIONS, {
        "bin": bin, "$where": "disposition_date IS NULL", "$limit": "200", "$order": "issue_date DESC",
      }),
      fetchDOBSafetyViolations(bin),
      fetchFDNYViolations(bin),
    ]);

    const dobMapped = dobViolationsRaw.map((v: any) => {
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
    });

    // Merge and deduplicate DOB violations from both datasets
    const allDob = [...dobMapped, ...dobSafetyRaw];
    const dedupedDob = deduplicateByKey(allDob, (r) => `DOB-${r.violation_number || r.id}`);
    violations.push(...dedupedDob);

    // Add FDNY direct violations (will be deduped against OATH FDNY later)
    violations.push(...fdnyDirect);

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
      hearing_result: v.hearing_result || null,
    })));
  }

  if (bbl && bbl.length >= 10) {
    const borough = bbl.slice(0, 1);
    const block = bbl.slice(1, 6).replace(/^0+/, '') || '0';
    const lot = bbl.slice(6, 10).replace(/^0+/, '') || '0';
    const hpdViolations = await fetchNYCData(NYC_ENDPOINTS.HPD_VIOLATIONS, {
      "boroid": borough, "block": block, "lot": lot,
      "$where": "violationstatus = 'Open'", "$limit": "1000", "$order": "inspectiondate DESC",
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

  // Final deduplication across all sources (e.g., FDNY direct vs OATH FDNY)
  return deduplicateByKey(violations, (v) => `${v.agency}-${v.violation_number || v.id}`);
}

// shouldExcludeApplication removed — classifyApplication handles exclusion via EXCLUDE tag

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

async function fetchApplications(bin: string): Promise<any[]> {
  const applications: any[] = [];
  if (!bin) return applications;

  // Dual-query DOB Jobs: recent activity + oldest filings
  const [dobJobsRecent, dobJobsOldest] = await Promise.all([
    fetchNYCData(NYC_ENDPOINTS.DOB_JOBS, {
      "bin__": bin, "$limit": "500", "$order": "latest_action_date DESC",
    }),
    fetchNYCData(NYC_ENDPOINTS.DOB_JOBS, {
      "bin__": bin, "$limit": "500", "$order": "pre__filing_date ASC",
    }),
  ]);

  // Merge and deduplicate by job number
  const allDobJobs = [...dobJobsRecent, ...dobJobsOldest];
  const dedupedJobs = deduplicateByKey(allDobJobs, (j) => j.job__ || '');

  let bisApps = dedupedJobs.map((j: any) => {
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
  });

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
  }));
  applications.push(...nowApps);

  return applications;
}

// ━━━ DETERMINISTIC RULES ENGINE ━━━

function parseConcern(customerConcern: string | null): {
  targetUnit: string | null;
  targetFloor: string | null;
  isPurchase: boolean;
  isRefinance: boolean;
  keywords: string[];
} {
  if (!customerConcern) return { targetUnit: null, targetFloor: null, isPurchase: false, isRefinance: false, keywords: [] };
  const lower = customerConcern.toLowerCase();

  const unitMatch = lower.match(/(?:unit|apt|apartment|#)\s*(\w+)/);
  const targetUnit = unitMatch ? unitMatch[1].toUpperCase() : null;

  const floorMatch = lower.match(/(?:(\d+)(?:st|nd|rd|th)?\s*(?:floor|fl))|(?:floor\s*(\d+))/);
  const targetFloor = floorMatch ? (floorMatch[1] || floorMatch[2]) : null;

  const isPurchase = /purchas|acqui|buy|closing|transaction|contract/.test(lower);
  const isRefinance = /refin|refi|mortgage|loan/.test(lower);

  const keywords: string[] = [];
  if (/facade|fisp|ll11/.test(lower)) keywords.push('facade');
  if (/elevator|lift/.test(lower)) keywords.push('elevator');
  if (/gas|boiler/.test(lower)) keywords.push('gas');
  if (/fire|sprinkler|standpipe/.test(lower)) keywords.push('fire');
  if (/illegal|conversion/.test(lower)) keywords.push('illegal');
  if (/vacate|unsafe/.test(lower)) keywords.push('safety');

  return { targetUnit, targetFloor, isPurchase, isRefinance, keywords };
}

function classifyViolation(v: any): { tag: string; reason: string } {
  const agency = (v.agency || '').toUpperCase();
  const status = (v.status || '').toLowerCase();
  const desc = (v.description_raw || v.violation_type || '').toLowerCase();
  const vClass = (v.violation_class || v.class || '').toUpperCase();
  const penalty = parseFloat(v.penalty_amount || v.penalty_imposed || '0') || 0;
  const hearingResult = (v.hearing_result || '').toLowerCase();

  // EXCLUDE: Closed/Resolved — these don't belong in the report
  if (status === 'closed' || status === 'resolved' || status === 'dismissed' || status === 'paid') {
    return { tag: 'EXCLUDE', reason: 'closed' };
  }
  if (status.includes('close') || status.includes('certif') || status.includes('complied')) {
    return { tag: 'EXCLUDE', reason: 'certified_closed' };
  }

  // DOB Violations
  if (agency === 'DOB') {
    if (v.is_stop_work_order) return { tag: '[ACTION REQUIRED]', reason: 'stop_work_order' };
    if (v.is_partial_stop_work) return { tag: '[ACTION REQUIRED]', reason: 'partial_stop_work' };
    if (v.is_vacate_order) return { tag: '[ACTION REQUIRED]', reason: 'vacate_order' };
    if (desc.includes('unsafe') || desc.includes('hazardous') || desc.includes('emergency'))
      return { tag: '[ACTION REQUIRED]', reason: 'unsafe_hazardous' };
    if (desc.includes('illegal conversion') || desc.includes('illegal use'))
      return { tag: '[ACTION REQUIRED]', reason: 'illegal_conversion' };
    if (desc.includes('facade') || desc.includes('fisp'))
      return { tag: '[ACTION REQUIRED]', reason: 'facade_fisp' };
    if (v.disposition) return { tag: 'EXCLUDE', reason: 'has_disposition' };
    return { tag: '[MONITOR]', reason: 'open_dob_violation' };
  }

  // ECB Violations
  if (agency === 'ECB') {
    if (hearingResult.includes('default'))
      return { tag: '[ACTION REQUIRED]', reason: 'ecb_default_judgment' };
    if (penalty > 0)
      return { tag: '[ACTION REQUIRED]', reason: 'ecb_open_penalty' };
    return { tag: '[MONITOR]', reason: 'ecb_open_no_penalty' };
  }

  // HPD Violations
  if (agency === 'HPD') {
    if (vClass === 'C') return { tag: '[ACTION REQUIRED]', reason: 'hpd_class_c_immediately_hazardous' };
    if (vClass === 'B') return { tag: '[ACTION REQUIRED]', reason: 'hpd_class_b_hazardous' };
    if (vClass === 'A') {
      const issuedDate = new Date(v.issued_date || '');
      const daysSince = (Date.now() - issuedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (!isNaN(daysSince) && daysSince > 90)
        return { tag: '[MONITOR]', reason: 'hpd_class_a_overdue' };
      return { tag: '[MONITOR]', reason: 'hpd_class_a_recent' };
    }
    return { tag: '[MONITOR]', reason: 'hpd_open' };
  }

  // FDNY Violations
  if (agency === 'FDNY') {
    if (desc.includes('sprinkler') || desc.includes('standpipe') || desc.includes('fire pump'))
      return { tag: '[ACTION REQUIRED]', reason: 'fdny_fire_suppression' };
    if (desc.includes('means of egress') || desc.includes('exit'))
      return { tag: '[ACTION REQUIRED]', reason: 'fdny_egress' };
    if (desc.includes('fire alarm'))
      return { tag: '[ACTION REQUIRED]', reason: 'fdny_fire_alarm' };
    if (penalty > 0)
      return { tag: '[ACTION REQUIRED]', reason: 'fdny_open_penalty' };
    return { tag: '[MONITOR]', reason: 'fdny_open' };
  }

  // LPC (Landmarks)
  if (agency === 'LPC') {
    if (penalty > 0) return { tag: '[ACTION REQUIRED]', reason: 'lpc_open_penalty' };
    return { tag: '[MONITOR]', reason: 'lpc_open' };
  }

  // DOF (Finance — liens attach to property)
  if (agency === 'DOF') {
    if (penalty > 0) return { tag: '[ACTION REQUIRED]', reason: 'dof_open_penalty_lien_risk' };
    return { tag: '[MONITOR]', reason: 'dof_open' };
  }

  // DEP, DSNY, DOT — quality of life agencies
  if (['DEP', 'DSNY', 'DOT'].includes(agency)) {
    if (penalty > 0) return { tag: '[MONITOR]', reason: 'quality_of_life_open_penalty' };
    return { tag: '[MONITOR]', reason: 'quality_of_life_open' };
  }

  return { tag: '[MONITOR]', reason: 'unclassified_open' };
}

function classifyApplication(app: any): { tag: string; reason: string } {
  const bisStatus = (app.job_status || app.status || '').toUpperCase().trim();
  const nowStatus = (app.filing_status || app.status || '').toLowerCase();
  const jobType = (app.job_type || app.application_type || '').toUpperCase().trim();
  const desc = (app.job_description || '').toLowerCase();

  const latestActionDate = new Date(app.latest_action_date || app.approved_date || '');
  const preFilingDate = new Date(app.pre__filing_date || app.filing_date || '');
  const permitIssuedDate = new Date(app.fully_permitted || app.permit_issued_date || app.issued_date || '');
  const now = Date.now();
  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  const daysSinceLastAction = !isNaN(latestActionDate.getTime())
    ? (now - latestActionDate.getTime()) / MS_PER_DAY : null;
  const daysSinceFiling = !isNaN(preFilingDate.getTime())
    ? (now - preFilingDate.getTime()) / MS_PER_DAY : null;
  const daysSincePermit = !isNaN(permitIssuedDate.getTime())
    ? (now - permitIssuedDate.getTime()) / MS_PER_DAY : null;

  const buildingWide = ['facade', 'elevator', 'gas', 'boiler', 'sprinkler', 'plumbing',
    'electrical', 'standpipe', 'fire alarm', 'fire escape', 'structural', 'foundation',
    'roof', 'parapet', 'water tank', 'sewer', 'oil burner'];
  const isBuildingWideWork = buildingWide.some(sys => desc.includes(sys));

  // 1. EXCLUDE: Terminal states
  if (bisStatus === 'X' || bisStatus === 'U') {
    return { tag: 'EXCLUDE', reason: 'sign_off_complete' };
  }
  if (nowStatus.includes('signed off') || nowStatus.includes('sign-off') ||
      nowStatus.includes('completed') || nowStatus.includes('complete')) {
    return { tag: 'EXCLUDE', reason: 'sign_off_complete' };
  }
  if (nowStatus.includes('withdrawn') || nowStatus.includes('withdraw')) {
    if (daysSinceLastAction && daysSinceLastAction > 730) {
      return { tag: 'EXCLUDE', reason: 'withdrawn_old' };
    }
    return { tag: '[MONITOR]', reason: 'recently_withdrawn' };
  }
  if (bisStatus === 'I' || nowStatus.includes('sign-off in review')) {
    return { tag: 'EXCLUDE', reason: 'signoff_in_review' };
  }

  // 2. STOP WORK / SUSPENDED / REVOKED
  if (bisStatus === '3') {
    return { tag: '[ACTION REQUIRED]', reason: 'suspended' };
  }
  if (nowStatus.includes('stop work') || nowStatus.includes('suspended') ||
      nowStatus.includes('revoked')) {
    return { tag: '[ACTION REQUIRED]', reason: 'stop_work_or_revoked' };
  }

  // 3. DISAPPROVED
  if (bisStatus === 'J') {
    if (daysSinceLastAction && daysSinceLastAction > 365) {
      return { tag: '[ACTION REQUIRED]', reason: 'disapproved_abandoned' };
    }
    return { tag: '[MONITOR]', reason: 'disapproved_active' };
  }

  // 4. PERMIT ISSUED — Check expiration
  if (bisStatus === 'Q' || bisStatus === 'R' ||
      nowStatus.includes('permit issued') || nowStatus.includes('permit entire') ||
      nowStatus.includes('permit partial')) {
    if (daysSincePermit && daysSincePermit > 730) {
      return { tag: '[ACTION REQUIRED]', reason: 'permit_expired_2yr_refile_likely' };
    }
    if (daysSincePermit && daysSincePermit > 365) {
      return { tag: '[ACTION REQUIRED]', reason: 'permit_expired_reinstatement' };
    }
    if (daysSinceLastAction && daysSinceLastAction > 365) {
      return { tag: '[MONITOR]', reason: 'permit_active_stale' };
    }
    if (jobType === 'DM') return { tag: '[MONITOR]', reason: 'demolition_permit_active' };
    if (jobType === 'NB') return { tag: '[MONITOR]', reason: 'new_building_permit_active' };
    if (jobType === 'A1') return { tag: '[MONITOR]', reason: 'structural_alt_permit_active' };
    if (isBuildingWideWork) return { tag: '[MONITOR]', reason: 'building_wide_work_active' };
    return { tag: '[MONITOR]', reason: 'permit_active' };
  }

  // 5. APPROVED (no permit yet)
  if (bisStatus === 'P' || nowStatus.includes('approved')) {
    if (daysSinceLastAction && daysSinceLastAction > 730) {
      return { tag: '[ACTION REQUIRED]', reason: 'approved_no_permit_2yr_abandoned' };
    }
    if (daysSinceLastAction && daysSinceLastAction > 365) {
      return { tag: '[MONITOR]', reason: 'approved_stale_service_notice' };
    }
    return { tag: '[MONITOR]', reason: 'approved_active' };
  }

  // 6. PLAN EXAM / PARTIAL APPROVAL
  if (bisStatus === 'H' || bisStatus === 'F' || bisStatus === 'K' ||
      nowStatus.includes('plan exam') || nowStatus.includes('review') ||
      nowStatus.includes('in process') || nowStatus.includes('partial approv')) {
    if (bisStatus === 'K' && (jobType === 'NB' || jobType === 'A1')) {
      return { tag: '[MONITOR]', reason: 'partial_approval_structural' };
    }
    if (daysSinceLastAction && daysSinceLastAction > 365) {
      return { tag: '[MONITOR]', reason: 'plan_exam_stale_possibly_abandoned' };
    }
    if (jobType === 'DM') return { tag: '[MONITOR]', reason: 'demolition_in_review' };
    return { tag: '[MONITOR]', reason: 'plan_exam_active' };
  }

  // 7. PAA (Post Approval Amendment)
  if (bisStatus === 'G' || bisStatus === 'L' || bisStatus === 'M') {
    if (bisStatus === 'G') return { tag: '[MONITOR]', reason: 'paa_fee_due' };
    return { tag: '[MONITOR]', reason: 'paa_in_progress' };
  }

  // 8. EARLY STAGES
  if (['A', 'B', 'C', 'D', 'E'].includes(bisStatus) ||
      nowStatus.includes('pre-fil') || nowStatus.includes('initial') ||
      nowStatus.includes('pending')) {
    if (daysSinceFiling && daysSinceFiling > 365) {
      return { tag: '[MONITOR]', reason: 'prefiled_abandoned_12mo' };
    }
    if (jobType === 'DM') return { tag: '[MONITOR]', reason: 'demolition_prefiled' };
    if (jobType === 'NB') return { tag: '[MONITOR]', reason: 'new_building_prefiled' };
    if (jobType === 'A1' || isBuildingWideWork) return { tag: '[MONITOR]', reason: 'structural_or_building_wide_early' };
    return { tag: '[MONITOR]', reason: 'early_stage' };
  }

  // 9. DEFAULT
  return { tag: '[MONITOR]', reason: 'unclassified' };
}

async function generateLineItemNotes(
  violations: any[],
  applications: any[],
  address: string,
  customerConcern: string | null,
  LOVABLE_API_KEY: string
): Promise<any[]> {
  // Parse the customer concern ONCE — used as AI context, NOT for tag elevation
  const concern = parseConcern(customerConcern);

  // Helper: check keyword overlap between item description and concern
  function getConcernOverlaps(desc: string): string[] {
    if (!concern.keywords.length) return [];
    return concern.keywords.filter(kw => desc.includes(kw));
  }

  // Helper: check if item is on the customer's target unit/floor
  function isOnTargetLocation(itemFloor: string | null, itemUnit: string | null): boolean {
    const floor = (itemFloor || '').toString();
    const unit = (itemUnit || '').toString().toUpperCase();
    return (!!concern.targetFloor && floor === concern.targetFloor) ||
           (!!concern.targetUnit && unit === concern.targetUnit);
  }

  // Classify and FILTER violations — EXCLUDE items are dropped from the report
  const violationItems = violations
    .map((v: any) => {
      const { tag, reason } = classifyViolation(v);
      if (tag === 'EXCLUDE') return null;

      const vDesc = (v.violation_type || v.description_raw || '').toLowerCase();
      return {
        type: "violation",
        id: v.violation_number || v.id,
        agency: v.agency,
        desc: (v.violation_type || v.description_raw || 'Unknown').slice(0, 120),
        floor: v.story || v.floor || null,
        apt: v.apartment || v.unit || null,
        status: v.violation_status || v.status || null,
        penalty_amount: v.penalty_amount || v.penalty_imposed || null,
        hearing_status: v.hearing_status || null,
        class: v.nov_class || v.class_value || v.violation_class || null,
        pre_assigned_tag: tag,
        classification_reason: reason,
        concern_keyword_match: getConcernOverlaps(vDesc),
        is_target_location: isOnTargetLocation(v.story || v.floor, v.apartment || v.unit),
      };
    })
    .filter(Boolean)
    .slice(0, 60);

  // Classify and FILTER applications — EXCLUDE items are dropped
  const applicationItems = applications
    .map((a: any) => {
      const { tag, reason } = classifyApplication(a);
      if (tag === 'EXCLUDE') return null;

      const aDesc = (a.job_description || '').toLowerCase();
      return {
        type: "application",
        id: `${a.source || 'BIS'}-${a.application_number || a.job__ || a.id}`,
        source: a.source || 'BIS',
        job_type: a.job_type || a.application_type || null,
        bis_status: a.job_status || null,
        desc: (a.job_description || a.application_type || 'Unknown').slice(0, 120),
        floor: a.floor || null,
        apt: a.apartment || null,
        status: a.permit_status || a.application_status || a.filing_status || a.status || null,
        latest_action_date: a.latest_action_date || null,
        fully_permitted: a.fully_permitted || null,
        pre_assigned_tag: tag,
        classification_reason: reason,
        concern_keyword_match: getConcernOverlaps(aDesc),
        is_target_location: false,
      };
    })
    .filter(Boolean)
    .slice(0, 40);

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

━━━ CLASSIFICATION ━━━
Each item has a "pre_assigned_tag" field that has ALREADY been classified by our rules engine.
You MUST use this exact tag as the prefix of your note. Do NOT override or change it.

Your job is ONLY to write the professional note sentence that follows the tag.

Format: {pre_assigned_tag} One to two sentences explaining what this item is and its impact.

━━━ CUSTOMER CONCERN ━━━
The client's attorney submitted this report with a specific concern (provided above).
Each item has two context flags:
- "concern_keyword_match": array of matched keywords (e.g. ["facade"]) — this is a surface-level text match only. YOU must decide if the match actually matters for the concern.
- "is_target_location": boolean — true if the item is on the same floor/unit the customer specified.

YOUR JOB is to reason about whether the item actually matters for the concern:
- If concern_keyword_match is non-empty, ALWAYS address in the note whether it's relevant and why.
- If is_target_location is true, mention the location overlap.
- If customer_concern mentions purchase/closing/refinance, note whether open penalties or enforcement could delay the transaction.
- If there is NO customer concern, write notes in a general due diligence context.

━━━ DOB APPLICATION LIFECYCLE ━━━
Each application item includes a "classification_reason" field. Use it to write precise notes:
- "permit_expired_2yr_refile_likely" → Permit expired 2+ years ago. May need full refile if code/zoning changed. Verify on BIS NOW.
- "permit_expired_reinstatement" → Permit expired >12 months. Reinstatement requires full filing fee per DOB Jan 2024 service notice.
- "permit_active_stale" → No recorded activity in 12+ months. DOB may have issued a service notice.
- "disapproved_abandoned" → Disapproved with no action for 12+ months. Deemed abandoned per §28-105.2.
- "prefiled_abandoned_12mo" → Pre-filed with no progress for 12+ months. DOB considers this abandoned.
- "approved_no_permit_2yr_abandoned" → Approved but no permit pulled for 2+ years. Must refile.
- "approved_stale_service_notice" → Approved 12+ months ago, no permit. DOB likely sent first service notice.
- "suspended" / "stop_work_or_revoked" → Active enforcement. No new permits until resolved.
- "recently_withdrawn" → Withdrawn within last 2 years. Attorney should know what was planned.

Examples:
- [ACTION REQUIRED] Open ECB violation with $3,125 penalty balance due. Outstanding ECB penalties become liens on the property and must be resolved before closing.
- [ACTION REQUIRED] BIS alteration permit approved 09/2023 with no recorded activity for 26 months. DOB likely withdrew this application; verify status on BIS NOW before closing.
- [MONITOR] BIS alteration application for plumbing work on floors 1-3. Filing is in progress; verify completion status with DOB. Client's unit is on floor 2 — this work directly affects the subject unit.

If the item has floor/apt data, include it in the identification clause.
Be declarative and precise. State exact dollar amounts for penalties. Reference specific NYC code sections where relevant.

━━━ ITEMS TO REVIEW ━━━
${JSON.stringify(allItems, null, 2)}`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a licensed NYC real estate compliance analyst and paralegal specialist with 15 years of experience reviewing DOB, ECB, HPD, FDNY, DSNY, DOT, LPC, and DOF records for transactional due diligence. Your notes are read by real estate attorneys, title companies, and sophisticated investors. Be precise, professional, and attorney-ready. Return structured JSON via the tool call. CRITICAL: Use the pre_assigned_tag from each item exactly as-is — do NOT change the classification." },
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

    // Fetch violations, applications, and complaints in parallel
    const [violations, rawApplications, complaints] = await Promise.all([
      fetchViolations(bin, bbl),
      fetchApplications(bin),
      fetchDOBComplaints(bin),
    ]);

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
      complaints_data: complaints,
      ai_analysis: aiAnalysis,
      line_item_notes: lineItemNotes,
      status: 'pending_review',
    }).eq('id', reportId);

    if (updateError) throw updateError;
    console.log(`=== Report generated successfully with ${lineItemNotes.length} line-item notes ===`);

    // Log AI usage (best-effort)
    try {
      const totalTokens = 2000;
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

    return new Response(JSON.stringify({ success: true, bin, bbl, violationsCount: violations.length, applicationsCount: applications.length, complaintsCount: complaints.length, notesCount: lineItemNotes.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error generating DD report:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
