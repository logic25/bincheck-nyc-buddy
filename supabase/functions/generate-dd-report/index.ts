// DD Report Generator - Uses GeoSearch for address lookup
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  hashSnapshotData,
  buildSourceProvenance,
  extractActiveOrders,
  type ComplianceSnapshotData,
} from "../_shared/snapshot.ts";

// ━━━ NYC API RESPONSE VALIDATION SCHEMAS ━━━
// Validates the shape of external API responses to prevent corrupted data in reports

const DOBViolationSchema = z.object({
  isn_dob_bis_viol: z.string().optional(),
  number: z.string().optional(),
  violation_type: z.string().optional(),
  violation_category: z.string().optional(),
  description: z.string().optional(),
  violation_type_code: z.string().optional(),
  issue_date: z.string().optional(),
  disposition_date: z.string().optional(),
  disposition_comments: z.string().optional(),
}).passthrough();

const DOBSafetyViolationSchema = z.object({
  isn_dob_bis_viol: z.string().optional(),
  violation_number: z.string().optional(),
  violation_type: z.string().optional(),
  violation_type_description: z.string().optional(),
  violation_category: z.string().optional(),
  description: z.string().optional(),
  issue_date: z.string().optional(),
  violation_date: z.string().optional(),
  disposition_date: z.string().optional(),
}).passthrough();

const ECBViolationSchema = z.object({
  ecb_violation_number: z.string().optional(),
  ecb_violation_status: z.string().optional(),
  violation_description: z.string().optional(),
  infraction_code1: z.string().optional(),
  violation_type: z.string().optional(),
  issue_date: z.string().optional(),
  severity: z.string().optional(),
  penality_imposed: z.string().optional(),
  amount_paid: z.string().optional(),
  penalty_balance_due: z.string().optional(),
}).passthrough();

const HPDViolationSchema = z.object({
  violationid: z.union([z.string(), z.number()]).optional(),
  violationstatus: z.string().optional(),
  novdescription: z.string().optional(),
  class: z.string().optional(),
  inspectiondate: z.string().optional(),
  novissueddate: z.string().optional(),
  apartment: z.string().optional(),
  story: z.string().optional(),
}).passthrough();

const OATHHearingSchema = z.object({
  ticket_number: z.string().optional(),
  respondent_ticket_number: z.string().optional(),
  violation_date: z.string().optional(),
  hearing_status: z.string().optional(),
  hearing_result: z.string().optional(),
  compliance_status: z.string().optional(),
  charge_1_code_description: z.string().optional(),
  charge_2_code_description: z.string().optional(),
  penalty_imposed: z.string().optional(),
  total_violation_amount: z.string().optional(),
  issuing_agency: z.string().optional(),
}).passthrough();

const FDNYViolationSchema = z.object({
  violation_number: z.string().optional(),
  issuance_number: z.string().optional(),
  violation_code: z.string().optional(),
  violation_code_description: z.string().optional(),
  violation_category: z.string().optional(),
  inspection_date: z.string().optional(),
  violation_date: z.string().optional(),
  status: z.string().optional(),
  violation_status: z.string().optional(),
}).passthrough();

const DOBJobSchema = z.object({
  job__: z.string().optional(),
  bin__: z.string().optional(),
  gis_bin: z.string().optional(),
  house__: z.string().optional(),
  street_name: z.string().optional(),
  borough: z.string().optional(),
  block: z.string().optional(),
  lot: z.string().optional(),
  job_type: z.string().optional(),
  job_status: z.string().optional(),
  job_description: z.string().optional(),
  pre__filing_date: z.string().optional(),
  latest_action_date: z.string().optional(),
}).passthrough();

const DOBComplaintSchema = z.object({
  complaint_number: z.string().optional(),
  date_entered: z.string().optional(),
  status: z.string().optional(),
  complaint_category: z.string().optional(),
  unit: z.string().optional(),
  disposition_date: z.string().optional(),
  disposition_code: z.string().optional(),
  inspection_date: z.string().optional(),
}).passthrough();

// Maps agency tags to their validation schemas for array-level validation
const AGENCY_SCHEMAS: Record<string, z.ZodType> = {
  'DOB': DOBViolationSchema,
  'DOB-SAFETY': DOBSafetyViolationSchema,
  'ECB': ECBViolationSchema,
  'HPD': HPDViolationSchema,
  'FDNY': FDNYViolationSchema,
  'DOB-BIS': DOBJobSchema,
  'DOB-NOW': DOBJobSchema,
  'DOB-COMPLAINTS': DOBComplaintSchema,
  // OATH hearings (queried per agency via OATH endpoint)
  'DEP': OATHHearingSchema,
  'DOT': OATHHearingSchema,
  'DSNY': OATHHearingSchema,
  'LPC': OATHHearingSchema,
  'DOF': OATHHearingSchema,
};

// Validates an array of API records, filtering out malformed entries and logging issues
function validateAPIResponse<T>(records: any[], schema: z.ZodType<T>, agencyTag: string): T[] {
  const valid: T[] = [];
  let invalidCount = 0;
  for (const record of records) {
    const result = schema.safeParse(record);
    if (result.success) {
      valid.push(result.data);
    } else {
      invalidCount++;
      if (invalidCount <= 3) {
        console.warn(`${agencyTag} validation failed for record:`, result.error.issues.slice(0, 2));
      }
    }
  }
  if (invalidCount > 0) {
    console.warn(`${agencyTag}: ${invalidCount}/${records.length} records failed validation and were excluded`);
  }
  return valid;
}

const ALLOWED_ORIGINS = [
  'https://binchecknyc.com',
  'https://id-preview--5687520e-43de-4827-98f8-73a2100ce635.lovable.app',
  'http://localhost:5173',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  // Allow exact matches, plus any *.lovable.app or *.lovableproject.com subdomain
  const isAllowed = ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/.*\.lovable\.app$/.test(origin) ||
    /^https:\/\/.*\.lovableproject\.com$/.test(origin);
  const corsOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

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
  ACRIS_MASTER: "https://data.cityofnewyork.us/resource/bnx9-e6tj.json",
  ACRIS_PARTIES: "https://data.cityofnewyork.us/resource/636b-3b5g.json",
  ACRIS_LEGALS: "https://data.cityofnewyork.us/resource/8h5j-fqxa.json",
  TAX_LIEN_SALE: "https://data.cityofnewyork.us/resource/9rz4-mjek.json",
  // Coverage Exceed v1 — DataTrace parity sources
  DOF_CHARGES: "https://data.cityofnewyork.us/resource/scjx-j6np.json",       // DOF Property Charges (tax + DEP balances)
  FUEL_BURNERS: "https://data.cityofnewyork.us/resource/f4rp-2kvy.json",      // DOB Fuel Burning Permits / Air Resources
  DOB_CO: "https://data.cityofnewyork.us/resource/bs8b-p36w.json",            // DOB Certificates of Occupancy
  DOT_SIDEWALK: "https://data.cityofnewyork.us/resource/6kbp-uz6m.json",      // DOT Sidewalk Violations
  HPD_OMO: "https://data.cityofnewyork.us/resource/mdbu-nrqn.json",           // HPD Open Market Order (Emergency Repair) charges
  HPD_HWO: "https://data.cityofnewyork.us/resource/sbnd-xujn.json",           // HPD Handyman Work Order charges
  FDNY_VIOLATIONS_DD: "https://data.cityofnewyork.us/resource/avgm-ztsb.json",// FDNY violations (also queried in search-property)
  // Agency-direct expansion (PR #5)
  FDNY_VACATE: "https://data.cityofnewyork.us/resource/n5xc-7jfa.json",        // FDNY Building Vacate Orders
  FDNY_BFP_ACTIVE: "https://data.cityofnewyork.us/resource/bi53-yph3.json",    // Bureau of Fire Prevention - Active Violation Orders (Historical)
};

// External deep-link builders (agency-direct PDFs and tools — clickable evidence in the report)
function buildCOPdfUrl(bin: string): string {
  // BIS Certificates of Occupancy lookup page (lists all CO PDFs for the BIN)
  return `http://a810-bisweb.nyc.gov/bisweb/COsByLocationServlet?requestid=1&allbin=${bin}`;
}
function buildBISJobPdfUrl(jobNumber: string): string {
  // Per-job CO document; works for both signed-off COs and open ALT jobs
  return `http://a810-bisweb.nyc.gov/bisweb/CofoJobDocumentServlet?passjobnumber=${jobNumber}&fillerdata=A`;
}
function buildTaxMapUrl(bbl: string): string {
  // NYC Property Information Portal — parcel view (includes tax map)
  return `https://propertyinformationportal.nyc.gov/parcels/parcel/${bbl}`;
}
function buildDOFAccountUrl(bbl: string): string {
  // DOF Property Tax Public Access portal
  return `https://a836-pts-access.nyc.gov/care/forms/htmlframe.aspx?mode=content/home.htm`;
}
function buildACRISBblUrl(bbl: string): string {
  if (!bbl || bbl.length < 10) return '';
  const borough = bbl.substring(0, 1);
  const block = bbl.substring(1, 6).replace(/^0+/, '');
  const lot = bbl.substring(6, 10).replace(/^0+/, '');
  return `https://a836-acris.nyc.gov/bblsearch/bblsearch.asp?borough=${borough}&block=${block}&lot=${lot}`;
}
// ACRIS per-document deep links — turn a doc_id into the agency's own pages
function buildACRISDocDetailUrl(docId: string): string {
  if (!docId) return '';
  return `https://a836-acris.nyc.gov/DS/DocumentSearch/DocumentDetail?doc_id=${docId}`;
}
function buildACRISDocImageViewUrl(docId: string): string {
  if (!docId) return '';
  return `https://a836-acris.nyc.gov/DS/DocumentSearch/DocumentImageView?doc_id=${docId}`;
}
function buildACRISGetImageUrl(docId: string, page: number = 1): string {
  if (!docId) return '';
  return `https://a836-acris.nyc.gov/DS/DocumentSearch/GetImage?doc_id=${docId}&page=${page}`;
}
// Agency-direct portal deep links — let analysts/clients jump to the source system
function buildDEPPortalUrl(): string {
  // DEP customer portal landing (sign-in required for account-level data)
  return `https://www.nyc.gov/site/dep/pay-my-bills/how-to-pay.page`;
}
function buildFDNYBusinessPortalUrl(): string {
  // FDNY Business — permits, COFs, LOAs (sign-in required for account-level data)
  return `https://fires.fdnycloud.org/CitizenAccess/Default.aspx`;
}
function buildACRISSearchUrl(): string {
  return `https://a836-acris.nyc.gov/DS/DocumentSearch/Index`;
}

const BOROUGH_CODES: Record<string, string> = {
  "MANHATTAN": "1", "MN": "1", "NEW YORK": "1",
  "BRONX": "2", "BX": "2", "THE BRONX": "2",
  "BROOKLYN": "3", "BK": "3", "KINGS": "3",
  "QUEENS": "4", "QN": "4",
  "STATEN ISLAND": "5", "SI": "5", "RICHMOND": "5",
};

const NYC_APP_TOKEN = Deno.env.get("NYC_APP_TOKEN") || "";

// Track which API calls encountered errors
const agencyErrors = new Set<string>();

async function fetchNYCData(endpoint: string, params: Record<string, string>, agencyTag?: string): Promise<any[]> {
  const url = new URL(endpoint);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  if (NYC_APP_TOKEN) url.searchParams.set("$$app_token", NYC_APP_TOKEN);
  try {
    console.log(`Fetching: ${url.toString()}`);
    const response = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`NYC API error ${response.status}: ${errorText.substring(0, 200)}`);
      if (agencyTag) agencyErrors.add(agencyTag);
      return [];
    }
    const data = await response.json();
    console.log(`Got ${Array.isArray(data) ? data.length : 'non-array'} results`);
    if (!Array.isArray(data)) return [];
    
    // Validate response shape if a schema exists for this agency
    const schema = agencyTag ? AGENCY_SCHEMAS[agencyTag] : null;
    if (schema && data.length > 0) {
      return validateAPIResponse(data, schema, agencyTag!);
    }
    return data;
  } catch (error) {
    console.error(`Error fetching from ${endpoint}:`, error);
    if (agencyTag) agencyErrors.add(agencyTag);
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

  const records = await fetchNYCData(NYC_ENDPOINTS.OATH_HEARINGS, params, agencyCode);
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
  }, 'FDNY');
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
  }, 'DOB');
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
  }, 'DOB-COMPLAINTS');
  // Official DOB Complaint Category codes — source: nyc.gov/assets/buildings/pdf/complaint_category.pdf (Rev. 09/21)
  const COMPLAINT_CATEGORIES: Record<string, string> = {
    "01": "Accident — Construction/Plumbing", "02": "Accident — To Public",
    "03": "Adjacent Buildings — Not Protected", "04": "After Hours Work — Illegal",
    "05": "Permit — None (Building/PA/Demo etc.)", "06": "Construction — Change Grade/Watercourse",
    "07": "Construction — Change Watercourse", "08": "Contractor's Sign — None",
    "09": "Debris — Excessive", "10": "Debris/Building — Falling or In Danger of Falling",
    "11": "Demolition — No Permit", "12": "Demolition — Unsafe/Illegal/Mechanical",
    "13": "Elevator In FDNY Readiness — None", "14": "Excavation — Undermining Adjacent Building",
    "15": "Fence — None/Inadequate/Illegal", "16": "Inadequate Support/Shoring",
    "17": "Material/Personnel Hoist — No Permit", "18": "Material Storage — Unsafe",
    "19": "Mechanical Demolition — Illegal", "20": "Landmark Building — Illegal Work",
    "21": "Safety Net/Guard Rail — Damaged/Inadequate/None (Over 6 Stories)",
    "22": "Safety Netting — None", "23": "Sidewalk Shed/Supported Scaffold — No Permit/Defect",
    "24": "Sidewalk Shed — None", "25": "Warning Signs/Lights — None",
    "26": "Watchman — None", "27": "Auto Repair — Illegal",
    "28": "Building — In Danger of Collapse", "29": "Building — Vacant, Open and Unguarded",
    "30": "Building Shaking/Vibrating/Structural Stability Affected",
    "31": "Certificate of Occupancy — None/Illegal/Contrary to CO",
    "32": "C of O — Not Being Complied With", "33": "Commercial Use — Illegal",
    "34": "Compactor Room/Refuse Chute — Illegal", "35": "Curb Cut/Driveway/Carport — Illegal",
    "36": "Driveway/Carport — Illegal", "37": "Egress — Locked/Blocked/Improper",
    "38": "Egress — Exit Door Not Proper", "39": "Egress — No Secondary Means",
    "40": "Falling — Part of Building", "41": "Falling — Part of Building in Danger Of",
    "42": "Fence — Illegal", "43": "Structural Stability Affected",
    "44": "Fireplace/Wood Stove — Illegal", "45": "Illegal Conversion",
    "46": "PA Permit — None", "47": "PA Permit — Not Being Complied With",
    "48": "Residential Use — Illegal", "49": "Storefront/Business Sign/Awning — Illegal",
    "50": "Sign Falling/Danger/Sign Erection — Illegal", "51": "Illegal Social Club",
    "52": "Sprinkler System — Inadequate", "53": "Vent/Exhaust — Illegal/Improper",
    "54": "Wall/Retaining Wall — Bulging/Cracked", "55": "Zoning — Non-Conforming",
    "56": "Boiler — Fumes/Smoke/Carbon Monoxide", "57": "Boiler — Illegal",
    "58": "Boiler — Defective/Inoperative/No Permit",
    "59": "Electrical Wiring — Defective/Exposed/In Progress",
    "60": "Electrical Work — Improper", "61": "Electrical Work — Unlicensed/In Progress",
    "62": "Elevator — Danger Condition/Shaft Open", "63": "Elevator — Defective/Inoperative",
    "64": "Elevator Shaft — Open and Unguarded",
    "65": "Gas Hook-Up/Piping — Illegal or Defective",
    "66": "Plumbing Work — Illegal/No Permit (Sprinkler/Standpipe)",
    "67": "Crane — No Permit/License/Cert/Unsafe", "68": "Crane/Scaffold — Unsafe Operations",
    "69": "Crane/Scaffold — Unsafe Installation/Equipment",
    "70": "Suspension Scaffold Hanging — No Work In Progress",
    "71": "SRO — Illegal Work/No Permit/Change in Occupancy",
    "72": "SRO — Change in Occupancy/Use", "73": "Failure to Maintain",
    "74": "Illegal Commercial/Manufacturing Use in Residential Zone",
    "75": "Adult Establishment", "76": "Unlicensed/Illegal Plumbing Work In Progress",
    "77": "Contrary to LL58/87 (Handicap Access)",
    "78": "Privately Owned Public Space — Non-Compliance",
    "79": "Lights from Parking Lot Shining on Building",
    "80": "Elevator — Not Inspected/Illegal/No Permit", "81": "Elevator — Accident",
    "82": "Boiler — Accident/Explosion",
    "83": "Construction — Contrary/Beyond Approved Plans/Permits",
    "84": "Façade — Defective/Cracking",
    "85": "Failure to Retain Water/Improper Drainage (LL103/89)",
    "86": "Work Contrary to Stop Work Order", "87": "Request for Deck Safety Inspection",
    "88": "Safety Net/Guard Rail — Damaged/None (6 Stories or Less)",
    "89": "Accident — Cranes/Derricks/Suspension",
    "90": "Unlicensed/Illegal Activity", "91": "Site Conditions Endangering Workers",
    "92": "Illegal Conversion of Manufacturing/Industrial Space",
    "93": "Request for Retaining Wall Safety Inspection",
    "94": "Plumbing — Defective/Leaking/Not Maintained",
    "95": "Bronx 2nd Offense Pilot Project",
    "96": "Unlicensed Boiler/Electrical/Plumbing/Sign Work Completed",
    "97": "Other Agency Jurisdiction", "98": "Other — Miscellaneous", "99": "Other — General Complaint",
    // Alphanumeric codes
    "1A": "Illegal Conversion — Commercial to Dwelling Units",
    "1B": "Illegal Tree Removal/Topo Change in SNAD",
    "1C": "Damage Assessment Request (Disaster)", "1D": "Con Edison Referral",
    "1E": "Suspended Scaffolds — No Permit/Dangerous/Accident",
    "1F": "Failure to Comply with Annual Crane Inspection",
    "1G": "Stalled Construction Site", "1H": "Emergency Asbestos Response Inspection",
    "1J": "Jewelry/Dentistry Torch — Gas Piping Removed w/o Permit",
    "1K": "Bowstring Truss Tracking", "1L": "Gas Utility Referral",
    "1N": "Gas Piping — Utility Referral Follow-Up",
    "1U": "Special Operations Compliance Inspection",
    "1V": "Electrical Enforcement Work Order (DOB)",
    "1W": "Plumbing Enforcement Work Order (DOB)",
    "1X": "Construction Enforcement Work Order (DOB)",
    "1Y": "Enforcement Work Order (DOB)", "1Z": "Enforcement Work Order (DOB)",
    "2A": "Posted Notice/Order Removed/Tampered With",
    "2B": "Failure to Comply with Vacate Order",
    "2C": "Smoking Ban — Smoking on Construction Site",
    "2D": "Smoking Signs — Not Observed on Site",
    "2E": "Tracking — Full Demolition Notification",
    "2F": "Building Under Structural Monitoring",
    "2G": "Advertising Sign/Billboard/Posters — Illegal",
    "2H": "Second Avenue Subway Construction", "2J": "SANDY — Building Destroyed",
    "2K": "Structurally Compromised Building (LL33/08)",
    "2L": "Façade (LL11/98) — Unsafe Notification", "2M": "Monopole Tracking",
    "2N": "COVID-19 Executive Order", "2P": "Façades Unit Compliance Inspection",
    "2Y": "Building Monitoring — Ongoing",
    "3A": "Unlicensed/Illegal Electrical Work In Progress",
    "3B": "Routine Inspection", "3C": "Plan Compliance Inspection",
    "3D": "Bicycle Access Waiver — Elevator Safety",
    "3E": "Bicycle Access Waiver — Alternate Parking",
    "3G": "Restroom Non-Compliance (LL79/16)", "3H": "DCP/BSA Compliance Inspection",
    "4A": "Illegal Hotel Rooms in Residential Buildings",
    "4B": "SEP — Professional Certification Audit",
    "4C": "Illegal Conversion — Follow-Up Inspection",
    "4D": "Construction Safety Compliance — Tracking",
    "4E": "Stalled Sites Tracking", "4F": "Building Compliance — Periodic Inspection",
    "4G": "Illegal Conversion No Access Follow-Up",
    "4H": "V.E.S.T. Program (DOB & NYPD)", "4J": "M.A.R.C.H. Program (Interagency)",
    "4K": "CSC — DM Tracking", "4L": "CSC — High-Rise Tracking",
    "4M": "CSC — Low-Rise Tracking", "4N": "Retaining Wall Tracking",
    "4P": "Legal/Padlock Tracking", "4Q": "Construction Safety — Special Inspection",
    "4S": "Sustainability Enforcement Work Order", "4W": "Woodside Settlement Project",
    "4X": "After Hours Work — With AHV Permit",
    "5A": "Request for Joint FDNY/DOB Inspection",
    "5B": "Non-Compliance — Lightweight Materials",
    "5C": "Structural Stability — New Building Under Construction",
    "5D": "Non-Compliance — TPPN 1/00 Vertical Enlargements",
    "5E": "Amusement Ride Accident/Incident", "5F": "Compliance Inspection",
    "5G": "Unlicensed/Illegal Work In Progress", "5H": "Illegal Activity",
    "5J": "Multi Agency Joint Inspection",
    "6A": "Vesting Inspection", "6B": "Homeless Shelter Inspection — Plumbing",
    "6C": "Homeless Shelter Inspection — Construction",
    "6D": "Homeless Shelter Inspection — Electrical",
    "6M": "Elevator — Multiple Devices on Property",
    "6S": "Elevator — Single Device/No Alternate Service",
    "6V": "Tenant Safety Inspection", "6W": "Tenant Safety — Failure to Post/Distribute",
    "6X": "Work Without Permits Watch List", "6Y": "Local Law Audits",
    "6Z": "Training Compliance",
    "7A": "Integrity Complaint Referral",
    "7B": "Illegal Commercial/Manufacturing Use in C1/C2 Zone",
    "7F": "CSE — Tracking Compliance", "7G": "CSE — Sweep",
    "7J": "Work Without a Permit — Occupied Multiple Dwelling",
    "7K": "Local Law 188/17 Compliance — Active Jobs",
    "7L": "DOHMH Referral — Tenant Protection Non-Compliance",
    "7N": "Privately Owned Public Space — Compliance Inspection",
    "7P": "Quality of Life — Noise/Dust/Vibration",
    "7Q": "Façade — Emergency Inspection Request",
    "7R": "Gas Work — Compliance Inspection",
    "7S": "Construction Site — Environmental Compliance",
    "8A": "Construction Safety Compliance (CSC) Action",
    "8P": "Proactive Enforcement — Building Inspection",
  };

  return records.map((c: any) => {
    const code = (c.complaint_category || '').trim();
    const decoded = COMPLAINT_CATEGORIES[code] || `Category ${code}`;
    return {
      complaint_number: c.complaint_number || '',
      date_entered: c.date_entered || '',
      status: c.status || '',
      complaint_category: c.complaint_category || '',
      category_description: decoded,
      unit: c.unit || '',
      disposition_date: c.disposition_date || '',
      disposition_code: c.disposition_code || '',
      inspection_date: c.inspection_date || '',
      description: decoded,
    };
  });
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

async function fetchViolations(bin: string, bbl: string, isResidentialProperty: boolean = true): Promise<any[]> {
  const violations: any[] = [];

  if (bin) {
    // Fetch DOB BIS violations, DOB Safety violations, and FDNY violations in parallel
    const [dobViolationsRaw, dobSafetyRaw, fdnyDirect] = await Promise.all([
      fetchNYCData(NYC_ENDPOINTS.DOB_VIOLATIONS, {
        "bin": bin, "$where": "disposition_date IS NULL", "$limit": "200", "$order": "issue_date DESC",
      }, 'DOB'),
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
    }, 'ECB');
    violations.push(...ecbViolations.map((v: any) => {
      const imposed = v.penality_imposed ? parseFloat(v.penality_imposed) : null;
      const paid = v.amount_paid ? parseFloat(v.amount_paid) : 0;
      const balanceDue = v.penalty_balance_due ? parseFloat(v.penalty_balance_due) : null;
      // Use balance_due if available, otherwise calculate from imposed - paid
      const effectivePenalty = balanceDue !== null ? balanceDue : (imposed !== null ? Math.max(0, imposed - paid) : null);
      return {
        id: v.ecb_violation_number, agency: "ECB",
        violation_number: v.ecb_violation_number, violation_type: v.infraction_code1 || null,
        violation_class: v.violation_type || null, description_raw: v.violation_description || null,
        issued_date: v.issue_date || null, severity: v.severity || null,
        status: (v.ecb_violation_status || 'open').toLowerCase(),
        penalty_amount: effectivePenalty,
        penalty_imposed: imposed,
        amount_paid: paid,
        hearing_date: v.hearing_date || null,
        hearing_result: v.hearing_result || null,
      };
    }));
  }

    if (bbl && bbl.length >= 10) {
    const borough = bbl.slice(0, 1);
    const block = bbl.slice(1, 6).replace(/^0+/, '') || '0';
    const lot = bbl.slice(6, 10).replace(/^0+/, '') || '0';

    // Only fetch HPD violations for residential/mixed-use properties (PLUTO landuse 01-03)
    // HPD has jurisdiction over housing only — skip for commercial/industrial buildings
    if (isResidentialProperty) {
      const hpdViolations = await fetchNYCData(NYC_ENDPOINTS.HPD_VIOLATIONS, {
        "boroid": borough, "block": block, "lot": lot,
        "$where": "violationstatus = 'Open'", "$limit": "1000", "$order": "inspectiondate DESC",
      }, 'HPD');
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
    } else {
      console.log('HPD: Skipped — commercial/industrial property (landuse not 01-03)');
    }

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

/**
 * fetchBISLive — live BIS job data via the bis-scraper-proxy edge function.
 *
 * Feature-flagged behind USE_LIVE_BIS=true. Falls back to the existing
 * Socrata path (DOB_JOBS dataset ic3t-wcy2) on any error so production
 * reports are never broken while testing.
 *
 * Returns normalized app objects in the same shape as the bisApps array
 * produced by fetchApplications, so downstream code is unaffected.
 */
async function fetchBISLive(bin: string): Promise<any[] | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("[fetchBISLive] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — skipping live BIS");
    return null;
  }

  try {
    console.log(`[fetchBISLive] Invoking bis-scraper-proxy for BIN ${bin}`);
    const resp = await fetch(`${supabaseUrl}/functions/v1/bis-scraper-proxy`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "jobs", bin }),
    });

    if (!resp.ok) {
      console.warn(`[fetchBISLive] Proxy returned ${resp.status} — falling back to Socrata`);
      return null;
    }

    const data = await resp.json();
    const rawJobs: any[] = data?.jobs ?? [];
    console.log(`[fetchBISLive] Got ${rawJobs.length} live BIS jobs for BIN ${bin}`);

    // Normalize scraped job fields into the same shape as bisApps
    // (the mapped output of the Socrata DOB_JOBS fetch in fetchApplications).
    // Fields not available from the live scraper are set to null so
    // downstream code never encounters undefined.
    const normalized = rawJobs.map((j: any) => ({
      id: j.job_number ?? null,
      source: "BIS",
      application_number: j.job_number ?? null,
      application_type: j.job_type_code ?? j.job_type ?? null,
      work_type: null,
      job_description: j.description ?? null,
      status: j.job_status ?? null,
      status_code: j.job_status_code ?? null,
      status_description: null,
      filing_date: j.filing_date ?? null,
      latest_action_date: j.status_date ?? null,
      estimated_cost: null,
      floor: j.floors ?? null,
      apartment: null,
      owner_name: null,
      filing_professional_name: j.applicant ?? null,
      // Extra live-only fields — ignored by existing downstream logic
      // but available for future use
      doc_number: j.doc_number ?? null,
      license_number: j.license_number ?? null,
      license_type: j.license_type ?? null,
      zoning_approval: j.zoning_approval ?? null,
      withdrawn: j.withdrawn ?? false,
      bis_scraped_at: data.scraped_at ?? null,
    }));

    return normalized;
  } catch (err: unknown) {
    console.warn(`[fetchBISLive] Error — falling back to Socrata:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * fetchDOFLive — live DOF PTAPS property tax data via the bis-scraper-proxy.
 *
 * Feature-flagged behind USE_LIVE_DOF=true. On any error or timeout the
 * caller falls back to the Socrata scjx-j6np dataset and logs a warning so
 * the report is never broken while the flag is being tested.
 *
 * Returns a data shape compatible with fetchDOFCharges so downstream
 * rendering code requires no changes.
 */
async function fetchDOFLive(bbl: string): Promise<any | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("[fetchDOFLive] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — skipping live DOF");
    return null;
  }

  try {
    console.log(`[fetchDOFLive] Invoking bis-scraper-proxy for BBL ${bbl} (action=dof_ptaps)`);
    const resp = await fetch(`${supabaseUrl}/functions/v1/bis-scraper-proxy`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "dof_ptaps", bbl }),
    });

    if (!resp.ok) {
      console.warn(`[fetchDOFLive] Proxy returned ${resp.status} — falling back to Socrata`);
      return null;
    }

    const data = await resp.json();

    // Surface soft errors from the scraper (e.g. "no records found") as
    // warnings so the caller can fall back cleanly.
    if (data?.error) {
      console.warn(`[fetchDOFLive] Scraper reported error: ${data.error} — falling back to Socrata`);
      return null;
    }

    console.log(
      `[fetchDOFLive] Live DOF data for BBL ${bbl}: outstanding=$${data?.totals?.outstanding ?? 0}, ` +
      `items=${data?.totals?.count ?? 0}, source=${data?.source}`
    );

    // Attach provenance fields so the report footnote knows the source.
    return {
      ...data,
      _live_source: "ptaps_live",
      _fetched_at: data.fetched_at ?? new Date().toISOString(),
    };
  } catch (err: unknown) {
    console.warn(`[fetchDOFLive] Error — falling back to Socrata:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * fetchDEPLive — live DEP CIS water/sewer account data via the bis-scraper-proxy.
 *
 * Feature-flagged behind USE_LIVE_DEP=true. On any error or timeout the
 * caller falls back to the WAT/SEW entries in the Socrata scjx-j6np dataset
 * and logs a warning.
 *
 * Returns a data shape compatible with the WAT/SEW items in fetchDOFCharges
 * so the report's charge-rendering logic works without modification.
 */
async function fetchDEPLive(bbl: string, address?: string): Promise<any | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("[fetchDEPLive] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — skipping live DEP");
    return null;
  }

  try {
    console.log(`[fetchDEPLive] Invoking bis-scraper-proxy for BBL ${bbl} (action=dep_cis)`);
    const resp = await fetch(`${supabaseUrl}/functions/v1/bis-scraper-proxy`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "dep_cis", bbl, address }),
    });

    if (!resp.ok) {
      console.warn(`[fetchDEPLive] Proxy returned ${resp.status} — falling back to Socrata`);
      return null;
    }

    const data = await resp.json();

    if (data?.error) {
      console.warn(`[fetchDEPLive] Scraper reported error: ${data.error} — falling back to Socrata`);
      return null;
    }

    console.log(
      `[fetchDEPLive] Live DEP data for BBL ${bbl}: outstanding=$${data?.totals?.outstanding ?? 0}, ` +
      `items=${data?.totals?.count ?? 0}, source=${data?.source}`
    );

    return {
      ...data,
      _live_source: "cis_live",
      _fetched_at: data.fetched_at ?? new Date().toISOString(),
    };
  } catch (err: unknown) {
    console.warn(`[fetchDEPLive] Error — falling back to Socrata:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * fetchDateDown — rerun just DOF PTAPS + DEP CIS for a "date-down" add-on.
 *
 * Used by the $49 date-down report flow where an analyst needs to confirm
 * the current property-tax and water balance without regenerating the full
 * report. Calls both live endpoints in parallel and returns only the charge
 * provenance payload. The caller (admin dashboard) writes the result back
 * to dof_charges_data / dep_charges_data and updates dof_source /
 * dep_source / dof_fetched_at / dep_fetched_at.
 *
 * Called via: POST /functions/v1/generate-dd-report
 *   with body { action: "date_down", report_id: "<uuid>", bbl: "<10-digit>", address?: "..." }
 *
 * Returns:
 *   {
 *     dof: <DOF PTAPS result or null>,
 *     dep: <DEP CIS result or null>,
 *     dof_source: "ptaps_live" | "unavailable",
 *     dep_source: "cis_live" | "unavailable",
 *     dof_fetched_at: string | null,
 *     dep_fetched_at: string | null,
 *   }
 */
async function fetchDateDown(bbl: string, address?: string): Promise<{
  dof: any | null;
  dep: any | null;
  dof_source: "ptaps_live" | "unavailable";
  dep_source: "cis_live" | "unavailable";
  dof_fetched_at: string | null;
  dep_fetched_at: string | null;
}> {
  const [dofLive, depLive] = await Promise.all([
    fetchDOFLive(bbl),
    fetchDEPLive(bbl, address),
  ]);

  return {
    dof: dofLive,
    dep: depLive,
    dof_source: dofLive !== null ? "ptaps_live" : "unavailable",
    dep_source: depLive !== null ? "cis_live" : "unavailable",
    dof_fetched_at: dofLive?._fetched_at ?? null,
    dep_fetched_at: depLive?._fetched_at ?? null,
  };
}

async function fetchApplications(bin: string): Promise<any[]> {
  const applications: any[] = [];
  if (!bin) return applications;

  // ── Live BIS path (feature flag: USE_LIVE_BIS=true) ──────────────────────
  // When enabled, fetches job filings directly from the DOB BIS website via
  // the bis-scraper-proxy edge function (Playwright on Railway). This gives
  // real-time data that matches what hand-written reports look up on BIS NOW,
  // replacing the stale Socrata dataset (scjx-j6np / ic3t-wcy2).
  // Falls back to Socrata automatically on any error.
  const useLiveBIS = Deno.env.get("USE_LIVE_BIS") === "true";
  if (useLiveBIS && bin) {
    const liveApps = await fetchBISLive(bin);
    if (liveApps !== null) {
      // Live fetch succeeded — use it; still fetch DOB NOW below for completeness
      applications.push(...liveApps);

      const dobNowAppsLive = await fetchNYCData(NYC_ENDPOINTS.DOB_NOW, { "bin": bin, "$limit": "200" }, 'DOB-NOW');
      const nowAppsLive = dobNowAppsLive.map((a: any) => ({
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
      applications.push(...nowAppsLive);
      return applications;
    }
    // liveApps === null means live fetch failed — fall through to Socrata below
    console.warn(`[fetchApplications] USE_LIVE_BIS=true but live fetch failed for BIN ${bin} — using Socrata fallback`);
  }

  // ── Socrata fallback (default path) ──────────────────────────────────────
  // Dual-query DOB Jobs: recent activity + oldest filings
  const [dobJobsRecent, dobJobsOldest] = await Promise.all([
    fetchNYCData(NYC_ENDPOINTS.DOB_JOBS, {
      "bin__": bin, "$limit": "500", "$order": "latest_action_date DESC",
    }, 'DOB-BIS'),
    fetchNYCData(NYC_ENDPOINTS.DOB_JOBS, {
      "bin__": bin, "$limit": "500", "$order": "pre__filing_date ASC",
    }, 'DOB-BIS'),
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

  const dobNowApps = await fetchNYCData(NYC_ENDPOINTS.DOB_NOW, { "bin": bin, "$limit": "200" }, 'DOB-NOW');
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

// Determine if a violation typically involves architect certification for dismissal
function isArchitectLikelyNeeded(v: any): boolean {
  const desc = (v.description_raw || v.violation_type || '').toLowerCase();
  const disposition = (v.disposition || '').toLowerCase();
  const status = (v.status || '').toLowerCase();
  const complaintCat = (v.complaint_category || '').trim();

  // Complaint categories that typically need architect involvement
  const architectCategories = ['12', '13', '04', '18', '82', '23', '45', '27'];
  if (architectCategories.includes(complaintCat)) return true;

  // Description-based detection
  if (desc.includes('illegal conversion') || desc.includes('illegal alteration')) return true;
  if (desc.includes('contrary to approved') || desc.includes('work contrary to')) return true;
  if (desc.includes('facade') || desc.includes('fisp') || desc.includes('local law 11')) return true;
  if (desc.includes('structural') || desc.includes('structural stability')) return true;
  if (desc.includes('unauthorized alteration') || desc.includes('change of use') || desc.includes('change of occupancy')) return true;
  if (desc.includes('certificate of occupancy') && desc.includes('contrary')) return true;
  if (desc.includes('illegal use') || desc.includes('non-conforming use')) return true;

  // Disposition/status mentions professional certification
  const combined = `${disposition} ${status}`;
  if (combined.includes('professional certification') || combined.includes('architect') || 
      combined.includes(' pe ') || combined.includes('letter required') ||
      combined.includes('prof cert')) return true;

  return false;
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

interface LearningContext {
  few_shot_examples: string[];
  relevance_examples: string[];
  knowledge_context: string[];
  confidence_flags: Array<{ agency: string; violation_type: string; edit_rate: number; top_error: string; needs_review: boolean }>;
}

async function fetchLearningExamples(supabaseUrl: string, supabaseServiceKey: string, agencies: string[]): Promise<LearningContext> {
  const empty: LearningContext = { few_shot_examples: [], relevance_examples: [], knowledge_context: [], confidence_flags: [] };
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/get-learning-examples`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${supabaseServiceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ agencies }),
    });
    if (!resp.ok) {
      console.warn("Failed to fetch learning examples:", resp.status);
      return empty;
    }
    const j = await resp.json();
    return { ...empty, ...j };
  } catch (e) {
    console.warn("Learning examples fetch error:", e);
    return empty;
  }
}

interface UnitContext {
  subjectType: 'unit' | 'building';
  subjectUnit: string | null;     // e.g. "10B" — null for whole-building reports
  scopeOfWork: string | null;     // e.g. "future combination 10A+10B"
  requestedByRole: string | null; // e.g. "Attorney"
}

async function generateLineItemNotes(
  violations: any[],
  applications: any[],
  address: string,
  customerConcern: string | null,
  LOVABLE_API_KEY: string,
  learningContext?: LearningContext,
  unitContext?: UnitContext
): Promise<any[]> {
  // Default to whole-building framing when no unit context is provided (back-compat).
  const ctx: UnitContext = unitContext ?? { subjectType: 'building', subjectUnit: null, scopeOfWork: null, requestedByRole: null };
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
        architect_likely_needed: isArchitectLikelyNeeded(v),
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

  // Build learning context sections
  let knowledgeSection = '';
  let fewShotSection = '';
  let confidenceSection = '';

  if (learningContext) {
    if (learningContext.knowledge_context.length > 0) {
      knowledgeSection = `\n━━━ KNOWLEDGE CONTEXT ━━━
Use the following reference material when writing notes for the relevant agencies and violation types:

${learningContext.knowledge_context.join('\n\n')}
`;
    }

    if (learningContext.few_shot_examples.length > 0) {
      fewShotSection = `\n━━━ COMMON MISTAKES TO AVOID ━━━
Here are common mistakes to AVOID, with examples of how an expert analyst corrected them:

${learningContext.few_shot_examples.join('\n')}
`;
    }

    if (learningContext.relevance_examples && learningContext.relevance_examples.length > 0) {
      fewShotSection += `\n━━━ RELEVANCE / IMPACT CORRECTIONS ━━━
Analyst-approved corrections to prior per-item unit_relevance and impact_note. Match the framing and specificity below:

${learningContext.relevance_examples.join('\n')}
`;
    }

    if (learningContext.confidence_flags.length > 0) {
      confidenceSection = `\n━━━ ACCURACY ALERTS ━━━
${learningContext.confidence_flags.map(f =>
  `CAUTION: Notes for ${f.agency} ${f.violation_type} items have a ${f.edit_rate}% correction rate. Most common issue: ${f.top_error.replace(/_/g, ' ')}. Be extra careful with these items.`
).join('\n')}
`;
    }
  }

  // ── Unit-aware subject framing ────────────────────────────────────────────
  const subjectLabel = ctx.subjectType === 'unit' && ctx.subjectUnit
    ? `Unit ${ctx.subjectUnit}`
    : 'the whole building';
  const scopeLine = ctx.scopeOfWork
    ? `Transaction context: ${ctx.scopeOfWork}.`
    : 'Transaction context: standard purchase / due diligence.';
  const roleLine = ctx.requestedByRole
    ? `Report requested by: ${ctx.requestedByRole}.`
    : '';

  const unitAwareInstruction = `
━━━ SUBJECT & UNIT CONTEXT ━━━
The subject of this report is ${subjectLabel} at ${address}.
${scopeLine}
${roleLine}

For EVERY item you must return three fields:

1. "note"         — plain-English explanation (1–3 sentences), starting with the pre_assigned_tag.
2. "unit_relevance" — one of: affects_unit | common_area | other_unit | whole_building | unknown
   - affects_unit   → the item directly concerns the subject unit (e.g. violation filed against that apt, permit for that floor/unit).
   - common_area    → elevator, lobby, facade, roof, sidewalk shed, boiler, shared systems.
   - other_unit     → another specific apartment or floor — not the subject unit.
   - whole_building → stop work orders, certificate of occupancy issues, vacate orders, building-wide ECB penalties.
   - unknown        → insufficient location data to classify.
3. "impact_note"  — one declarative sentence scoped to the subject. Examples:
   - "No impact on Unit 10B."
   - "Common area work; no direct impact on Unit 10B."
   - "Restricts future combination of 10A+10B."
   - "Affects building-wide certificate of occupancy — title should verify resolution before closing."
   - "Filed for adjacent unit 10A; relevant to planned combination scope."

When subjectType is 'building', use whole-building framing for impact_note (e.g. "Affects all units.").
If the item has no floor/unit data, default unit_relevance to "unknown" and note that location data is unavailable.

━━━ FEW-SHOT EXAMPLES (361 Clinton Ave, Unit 10B) ━━━
These show correct output for a unit-scoped report:

Example A — elevator violation:
{
  "note": "[MONITOR] Active DOB violation for elevator maintenance deficiency. Elevator violations are building-wide compliance matters.",
  "unit_relevance": "common_area",
  "impact_note": "No impact on Unit 10B."
}

Example B — partial stop work order on apt 3G:
{
  "note": "[MONITOR] Partial Stop Work Order (Job B00939880-I1) relates to apartment 3G on the 3rd floor; the partial SWO allows work to continue on other floors. Issued 12/30/25, partial lift granted 2/4/26.",
  "unit_relevance": "other_unit",
  "impact_note": "No impact on Unit 10B. Work on the 10th floor remains permitted."
}

Example C — permit for Unit 10A (adjacent unit):
{
  "note": "[MONITOR] Open DOB NOW alteration permit for apartment 10A filed 11/15/25. Scope includes interior partition work.",
  "unit_relevance": "other_unit",
  "impact_note": "Filed for adjacent unit 10A; relevant to future combination of 10A+10B — buyer should confirm permit scope before proceeding with combination."
}

Example D — lobby renovation permit:
{
  "note": "[CLEAN] DOB permit for lobby renovation (Application 301974861). No open enforcement actions.",
  "unit_relevance": "common_area",
  "impact_note": "Common area work; no impact on Unit 10B specifically."
}

Example E — whole-building ECB penalty:
{
  "note": "[ACTION REQUIRED] Open ECB violation with $8,500 penalty balance due for failure to maintain building facade under Local Law 11. Outstanding ECB penalties are liens on the property.",
  "unit_relevance": "whole_building",
  "impact_note": "Affects building-wide certificate of occupancy — title should verify resolution before closing."
}
`;

  const prompt = `PROPERTY: ${address}
BIN: ${allItems[0]?.bin || 'see data'} | Reviewing ${allItems.length} items

${concernInstruction}
${unitAwareInstruction}
${knowledgeSection}${fewShotSection}${confidenceSection}
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
- [ACTION REQUIRED] Open ECB violation with $3,125 penalty balance due. Outstanding ECB penalties become liens on the property and are typically resolved prior to closing.
- [ACTION REQUIRED] BIS alteration permit approved 09/2023 with no recorded activity for 26 months. DOB may have withdrawn this application; status can be verified on BIS NOW.
- [MONITOR] BIS alteration application for plumbing work on floors 1-3. Filing is in progress; completion status is available through DOB. Client's unit is on floor 2 — this work directly affects the subject unit.

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
          { role: "system", content: `You are a senior NYC real estate compliance data analyst with 15 years of experience reviewing DOB, ECB, HPD, FDNY, DSNY, DOT, LPC, and DOF records for transactional due diligence.
The subject of this report is ${subjectLabel} at ${address}. ${scopeLine} ${roleLine}
Your notes are read by real estate attorneys, title companies, and sophisticated investors.
Be precise, professional, and factual. Never provide legal advice, recommendations, or characterize risk levels. State facts and data only.
For each item return all three fields (note, unit_relevance, impact_note) via the tool call.
CRITICAL: Use the pre_assigned_tag from each item exactly as-is — do NOT change the classification.` },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "save_line_item_notes",
            description: "Save the generated notes for each violation and application, including per-item unit relevance and impact analysis.",
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
                      note: { type: "string", description: "Plain-English explanation, 1–3 sentences, starting with the pre_assigned_tag." },
                      unit_relevance: {
                        type: "string",
                        enum: ["affects_unit", "common_area", "other_unit", "whole_building", "unknown"],
                        description: "How this item relates to the subject unit or building.",
                      },
                      impact_note: {
                        type: "string",
                        description: "One declarative sentence scoped to the subject, e.g. 'No impact on Unit 10B.' or 'Restricts future combination of 10A+10B.'",
                      },
                    },
                    required: ["item_type", "item_id", "note", "unit_relevance", "impact_note"],
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

async function generatePropertyStatusSummary(
  building: any,
  violations: any[],
  applications: any[],
  complaints: any[],
  orders: any,
  customerConcern: string | null,
  LOVABLE_API_KEY: string
): Promise<string> {
  const openViolations = violations.filter((v: any) => v.status === 'open' || !v.status?.toLowerCase().includes('close'));
  const dobV = openViolations.filter((v: any) => v.agency === 'DOB');
  const ecbV = openViolations.filter((v: any) => v.agency === 'ECB');
  const hpdV = openViolations.filter((v: any) => v.agency === 'HPD');
  const fdnyV = openViolations.filter((v: any) => v.agency === 'FDNY');
  const otherV = openViolations.filter((v: any) => !['DOB', 'ECB', 'HPD', 'FDNY'].includes(v.agency));

  const ecbTotalPenalty = ecbV.reduce((sum: number, v: any) => sum + (parseFloat(v.penalty_amount) || 0), 0);
  const openComplaints = complaints.filter((c: any) => (c.status || '').toLowerCase() !== 'closed');

  // Build top items list for AI
  const topItems = openViolations.slice(0, 5).map((v: any) =>
    `${v.agency} Violation ${v.violation_number || 'N/A'}: ${v.violation_type || v.description_raw || 'No description'}. Issued: ${v.issued_date || 'Unknown'}. Status: ${v.status || 'open'}.${v.penalty_amount ? ` Penalty: $${parseFloat(v.penalty_amount).toLocaleString()}.` : ''}`
  ).join('\n');

  const topApps = applications.slice(0, 3).map((a: any) =>
    `${a.source} Application ${a.application_number || 'N/A'}: ${a.job_description || a.application_type || 'No description'}. Filed: ${a.filing_date || 'Unknown'}. Status: ${a.status || 'Unknown'}.`
  ).join('\n');

  const concernLine = customerConcern
    ? `\nSTATED AREA OF INTEREST: "${customerConcern}"\nIdentify which open items from the lists above relate to this topic. List them by number. Do NOT advise whether to proceed or not.`
    : '';

  const prompt = `PROPERTY DATA:
Address: ${building?.address || 'Unknown'}
BIN: ${building?.bin || 'Unknown'}
BBL: ${building?.bbl || 'Unknown'}
Building Class: ${building?.building_class || 'Unknown'}
Year Built: ${building?.year_built || 'Unknown'}
Stories: ${building?.stories || 'Unknown'}
Dwelling Units: ${building?.dwelling_units || 'Unknown'}
Zoning: ${building?.zoning_district || 'Unknown'}
Landmark: ${building?.is_landmark ? 'Yes' : 'No'}
Owner: ${building?.owner_name || 'Unknown'}

OPEN ITEMS BY AGENCY:
DOB: ${dobV.length} open violations
ECB: ${ecbV.length} open violations${ecbTotalPenalty > 0 ? ` (total outstanding penalties: $${ecbTotalPenalty.toLocaleString()})` : ''}
HPD: ${hpdV.length} open violations
FDNY: ${fdnyV.length} open violations
Other Agencies: ${otherV.length} open violations
Active Permits/Applications: ${applications.length}
DOB Complaints on Record: ${complaints.length} (${openComplaints.length} open)
Stop Work Orders: ${orders.stop_work?.length || 0}
Partial Stop Work Orders: ${orders.partial_stop_work?.length || 0}
Vacate Orders: ${orders.vacate?.length || 0}

TOP OPEN VIOLATIONS:
${topItems || 'None'}

RECENT APPLICATIONS:
${topApps || 'None'}
${concernLine}

Write a 3-4 paragraph factual property status summary. Use plain paragraphs only — no markdown, no headers, no bullet points, no bold text.`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a compliance data analyst preparing a factual property status summary for real estate professionals. Your role is to PRESENT INFORMATION, not give advice.

RULES:
- State facts only. Never recommend, suggest, advise, or characterize risk.
- Use neutral language: 'This property has 3 open DOB violations' NOT 'This property has a concerning number of violations'
- Reference specific violation numbers, dates, and amounts.
- If there are penalty amounts, state the total: 'Total outstanding ECB penalties: $45,000' — do NOT say whether this is high or low.
- Translate codes and abbreviations into plain English so non-experts understand what each item IS.
- Never use words like: risk, caution, concern, alarming, significant, recommend, suggest, advise, action required, should, must, urgent.
- End with: 'All findings are derived from publicly available municipal records which may contain errors, omissions, or delays. Information should be independently verified with the relevant city agencies.'

GOOD EXAMPLE: 'Violation 123456 is an active ECB violation for failure to maintain the building facade under Local Law 11. A hearing is scheduled for March 15, 2026. The listed penalty is $10,000.'

BAD EXAMPLE: 'Violation 123456 is a concerning facade violation that poses significant risk. We recommend resolving this before closing.'

Write in plain paragraphs. No markdown formatting, no headers, no bullet points, no bold text.`
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI property status summary error:", response.status);
      return "";
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (error) {
    console.error("Property status summary generation error:", error);
    return "";
  }
}

async function fetchACRISData(bbl: string): Promise<any> {
  if (!bbl || bbl.replace(/\D/g, '').length < 10) return { documents: [], deeds: [], mortgages: [], liens: [] };
  const clean = bbl.replace(/\D/g, '');
  const borough = clean.charAt(0);
  const block = clean.slice(1, 6);
  const lot = clean.slice(6, 10);

  try {
    // Step 1: Query ACRIS Legals to find document_ids for this BBL
    const legalRecords = await fetchNYCData(NYC_ENDPOINTS.ACRIS_LEGALS, {
      "$where": `borough='${borough}' AND block=${parseInt(block)} AND lot=${parseInt(lot)}`,
      "$limit": "30",
      "$order": "document_id DESC",
    }, 'ACRIS');

    console.log(`ACRIS Legals: ${legalRecords.length} records for BBL ${borough}-${block}-${lot}`);
    if (legalRecords.length === 0) return { documents: [], deeds: [], mortgages: [], liens: [] };

    // Step 2: Get unique document IDs and fetch master records
    const docIds = [...new Set(legalRecords.map((r: any) => r.document_id).filter(Boolean))];
    if (docIds.length === 0) return { documents: [], deeds: [], mortgages: [], liens: [] };

    const idList = docIds.map((id: string) => `'${id}'`).join(',');
    
    // Fetch master records and parties in parallel
    const [masterRecords, parties] = await Promise.all([
      fetchNYCData(NYC_ENDPOINTS.ACRIS_MASTER, {
        "$where": `document_id in(${idList})`,
        "$limit": "30",
        "$order": "document_date DESC",
      }),
      fetchNYCData(NYC_ENDPOINTS.ACRIS_PARTIES, {
        "$where": `document_id in(${idList})`,
        "$limit": "200",
      }),
    ]);

    console.log(`ACRIS Master: ${masterRecords.length} records, Parties: ${parties.length}`);

    const partiesMap: Record<string, any[]> = {};
    for (const p of parties) {
      if (!partiesMap[p.document_id]) partiesMap[p.document_id] = [];
      partiesMap[p.document_id].push(p);
    }

    const documents = masterRecords.map((r: any) => {
      const docParties = partiesMap[r.document_id] || [];
      const party1 = docParties.filter((p: any) => p.party_type === '1').map((p: any) => [p.name].filter(Boolean).join(' ')).join('; ') || null;
      const party2 = docParties.filter((p: any) => p.party_type === '2').map((p: any) => [p.name].filter(Boolean).join(' ')).join('; ') || null;
      const docId = r.document_id;
      return {
        document_id: docId,
        document_type: r.doc_type || r.document_type || null,
        document_date: r.document_date || null,
        recorded_date: r.recorded_datetime || null,
        document_amount: r.document_amt ? parseFloat(r.document_amt) : null,
        party1,
        party2,
        crfn: r.crfn || null,
        // PR #5 — ACRIS agency-direct deep links per document
        detail_url: docId ? buildACRISDocDetailUrl(docId) : null,
        image_view_url: docId ? buildACRISDocImageViewUrl(docId) : null,
        get_image_url: docId ? buildACRISGetImageUrl(docId, 1) : null,
      };
    });

    const DEED_TYPES = ['DEED', 'DEEDO', 'DEEDP', 'DEEDM', 'RPTT&RETT'];
    const MORTGAGE_TYPES = ['MTGE', 'AGMT', 'ASST', 'SMTG', 'CMTG'];
    const LIEN_TYPES = ['LIEN', 'FEDL', 'MECH', 'JUDGM', 'UCC1', 'UCC3'];

    const docType = (d: any) => (d.document_type || '').toUpperCase();
    const deeds = documents.filter(d => DEED_TYPES.some(t => docType(d).includes(t))).slice(0, 5);
    const mortgages = documents.filter(d => MORTGAGE_TYPES.some(t => docType(d).includes(t)));
    const liens = documents.filter(d => LIEN_TYPES.some(t => docType(d).includes(t)));

    console.log(`ACRIS: ${documents.length} documents, ${deeds.length} deeds, ${mortgages.length} mortgages, ${liens.length} liens`);
    return { documents, deeds, mortgages, liens };
  } catch (error) {
    console.error("ACRIS fetch error:", error);
    return { documents: [], deeds: [], mortgages: [], liens: [] };
  }
}

async function fetchTaxLienData(bbl: string): Promise<any[]> {
  if (!bbl || bbl.length < 10) return [];
  try {
    const borough = bbl.substring(0, 1);
    const block = bbl.substring(1, 6).replace(/^0+/, '');
    const lot = bbl.substring(6, 10).replace(/^0+/, '');
    
    console.log(`Tax Lien lookup: BBL=${bbl}, Borough=${borough}, Block=${block}, Lot=${lot}`);
    
    const records = await fetchNYCData(NYC_ENDPOINTS.TAX_LIEN_SALE, {
      "$where": `borough = '${borough}' AND block = '${block}' AND lot = '${lot}'`,
      "$limit": "50",
      "$order": "tax_class_code DESC",
    }, 'DOF-LIEN');
    
    console.log(`Tax Lien Sale: ${records.length} records found`);
    
    return records.map((r: any) => {
      // "Water Debt Only" is a Y/N flag on the lien sale dataset — surfaces DEP-only debt vs. mixed tax+water
      const wdRaw = (r.water_debt_only || r.water_debt || '').toString().toUpperCase();
      const waterDebtOnly = wdRaw === 'Y' || wdRaw === 'YES' || wdRaw === 'TRUE';
      const house = (r.house_number || '').toString().trim();
      const street = (r.street_name || '').toString().trim();
      const address = [house, street].filter(Boolean).join(' ') || null;
      return {
        borough: r.borough,
        block: r.block,
        lot: r.lot,
        address,
        building_class: r.building_class || null,
        tax_class_code: r.tax_class_code || null,
        lien_sale_year: r.year || r.calendar_year || r.month || null,
        cycle: r.cycle || null,
        water_debt_only: waterDebtOnly,
        eco_category: r.eco_category || null,
        community_district: r.community_district || r.community_board || null,
        council_district: r.council_district || null,
        zip_code: r.zip_code || null,
        raw: r,
      };
    });
  } catch (error) {
    console.error("Tax Lien Sale fetch error:", error);
    return [];
  }
}

// ============================================================================
// Coverage Exceed v1 — DataTrace parity fetch functions
// ============================================================================

/**
 * DOF Property Charges — outstanding tax / DEP / sidewalk / SAC charges by BBL.
 * Mirrors DataTrace's "Account Balance" and "Tax Search" sections.
 * Returns aggregated totals + raw line items grouped by charge type.
 *
 * Live path: USE_LIVE_DOF=true → fetches from DOF PTAPS via bis-scraper-proxy.
 * Fallback:  Socrata scjx-j6np dataset (kept as-is; never removed).
 * Source is recorded in the returned object as _live_source / _fetched_at so
 * the PrintView footnote can show provenance (e.g. "Pulled live from DOF PTAPS").
 */
async function fetchDOFCharges(bbl: string): Promise<any> {
  if (!bbl || bbl.length < 10) return { totals: { outstanding: 0, interest: 0, count: 0 }, by_type: {}, items: [] };

  // ── Live DOF PTAPS path (feature flag: USE_LIVE_DOF=true) ───────────────────────
  const useLiveDOF = Deno.env.get("USE_LIVE_DOF") === "true";
  if (useLiveDOF) {
    const liveData = await fetchDOFLive(bbl);
    if (liveData !== null) {
      console.log(`[fetchDOFCharges] Using live DOF PTAPS data for BBL ${bbl}`);
      return { ...liveData, _source: "ptaps_live" };
    }
    // liveData === null means live fetch failed — fall through to Socrata
    console.warn(`[fetchDOFCharges] USE_LIVE_DOF=true but live fetch failed for BBL ${bbl} — using Socrata fallback`);
  }

  // ── Socrata fallback (default path) ──────────────────────────────────────────
  try {
    // parid is 10-digit BBL same format we already use internally
    const records = await fetchNYCData(NYC_ENDPOINTS.DOF_CHARGES, {
      "$where": `parid = '${bbl}' AND sum_bal > 0`,
      "$limit": "200",
      "$order": "due_date DESC",
    }, 'DOF-CHARGES');

    console.log(`DOF Charges: ${records.length} outstanding records for BBL ${bbl}`);

    // Code dictionary — covers the codes that actually appear in scjx-j6np
    const CODE_LABELS: Record<string, string> = {
      'TAX': 'Property Tax',
      'SAC': 'Sidewalk Assessment Charge',
      'SAF': 'Sidewalk Repair (DOT Lien)',
      'EMR': 'Emergency Repair Charge',
      'ALT': 'Alteration Fee',
      'ALTOR': 'Alteration Order',
      'AB': 'Abated Building',
      'BID': 'Business Improvement District',
      'WAT': 'Water Charge (DEP)',
      'SEW': 'Sewer Charge (DEP)',
      'WTR': 'Water (DEP)',
      'IMP': 'Improvement',
      'INT': 'Interest',
    };

    let outstandingTotal = 0;
    let interestTotal = 0;
    const byType: Record<string, { label: string; count: number; balance: number; oldest_due: string | null }> = {};
    const items = records.map((r: any) => {
      const code = (r.code || 'UNK').toUpperCase();
      const balance = parseFloat(r.sum_bal || '0') || 0;
      const interest = parseFloat(r.sum_int || '0') || 0;
      outstandingTotal += balance;
      interestTotal += interest;
      const dueDate = r.due_date || null;
      if (!byType[code]) {
        byType[code] = { label: CODE_LABELS[code] || code, count: 0, balance: 0, oldest_due: dueDate };
      }
      byType[code].count += 1;
      byType[code].balance += balance;
      if (dueDate && (!byType[code].oldest_due || dueDate < byType[code].oldest_due)) {
        byType[code].oldest_due = dueDate;
      }
      return {
        code,
        code_label: CODE_LABELS[code] || code,
        account_id: r.account_id || null,
        balance,
        interest,
        liability: parseFloat(r.sum_liab || '0') || 0,
        collected: parseFloat(r.sum_coll || '0') || 0,
        due_date: dueDate,
        tax_year: r.taxyear || null,
        project_no: r.projno || null,
        cycle: r.cycle || null,
      };
    });

    return {
      _source: "socrata",
      _fetched_at: new Date().toISOString(),
      totals: {
        outstanding: Math.round(outstandingTotal * 100) / 100,
        interest: Math.round(interestTotal * 100) / 100,
        count: records.length,
      },
      by_type: byType,
      items: items.slice(0, 50),  // cap rendered line items
    };
  } catch (error) {
    console.error("DOF Charges fetch error:", error);
    return { _source: "socrata", totals: { outstanding: 0, interest: 0, count: 0 }, by_type: {}, items: [] };
  }
}

/**
 * DOB Fuel Burning Equipment — mirrors DataTrace "Air Resources Information Search".
 * Returns active (non-EXPIRED) records with fuel type, quantity, status.
 */
async function fetchFuelBurners(bin: string): Promise<any> {
  if (!bin) return { active: [], expired: [], total: 0 };
  try {
    const records = await fetchNYCData(NYC_ENDPOINTS.FUEL_BURNERS, {
      "bin": bin,
      "$limit": "100",
      "$order": "expirationdate DESC",
    }, 'DEP-FUEL');

    console.log(`Fuel Burners: ${records.length} records for BIN ${bin}`);

    const mapped = records.map((r: any) => ({
      record_id: r.record_id || r.recordid || null,
      primary_fuel: r.primaryfuel || r.primary_fuel || null,
      secondary_fuel: r.secondaryfuel || null,
      quantity: r.quantity || null,
      make: r.make || null,
      model: r.model || null,
      status: r.status || null,
      issue_date: r.issuedate || r.issue_date || null,
      expiration_date: r.expirationdate || r.expiration_date || null,
      installer: r.installer || null,
      device_type: r.devicetype || null,
    }));
    const active = mapped.filter((r: any) => {
      const s = (r.status || '').toUpperCase();
      return !s.includes('EXPIRED') && !s.includes('CANCEL');
    });
    const expired = mapped.filter((r: any) => !active.includes(r));
    return { active, expired, total: mapped.length };
  } catch (error) {
    console.error("Fuel Burners fetch error:", error);
    return { active: [], expired: [], total: 0 };
  }
}

/**
 * DOB Certificates of Occupancy — mirrors DataTrace "CO with Open Permit Search".
 * Returns most recent CO, all historic COs, and BIS PDF deep links per job.
 */
async function fetchCertificatesOfOccupancy(bin: string): Promise<any> {
  if (!bin) return { latest: null, all: [], total: 0, bis_lookup_url: null };
  try {
    const records = await fetchNYCData(NYC_ENDPOINTS.DOB_CO, {
      "bin_number": bin,
      "$limit": "50",
      "$order": "c_o_issue_date DESC",
    }, 'DOB-CO');

    console.log(`Certificates of Occupancy: ${records.length} records for BIN ${bin}`);

    const mapped = records.map((r: any) => ({
      job_number: r.job_number || null,
      job_type: r.job_type || null,
      issue_date: r.c_o_issue_date || null,
      issue_type: r.issue_type || null,            // Final / Temporary
      application_status: r.application_status_raw || null,
      filing_status: r.filing_status_raw || null,
      item_number: r.item_number || null,
      pdf_url: r.job_number ? buildBISJobPdfUrl(r.job_number) : null,
    }));

    return {
      latest: mapped[0] || null,
      all: mapped,
      total: mapped.length,
      bis_lookup_url: buildCOPdfUrl(bin),
      has_final: mapped.some((m: any) => (m.issue_type || '').toLowerCase().includes('final')),
      latest_temp: mapped.find((m: any) => (m.issue_type || '').toLowerCase().includes('temp')) || null,
    };
  } catch (error) {
    console.error("Certificates of Occupancy fetch error:", error);
    return { latest: null, all: [], total: 0, bis_lookup_url: null };
  }
}

/**
 * DOT Sidewalk Violations — mirrors DataTrace "Highway / Sidewalk Violation Search".
 * The bblid in this dataset is a DOT-internal id (NOT our BBL), so we query by
 * address (house_num + onstname) which is what DataTrace itself does.
 */
async function fetchSidewalkViolations(building: any): Promise<any> {
  const houseNumber = (building?.house_number || building?.address?.split(' ')[0] || '').trim();
  const street = (building?.street_name || '').trim().toUpperCase();
  if (!houseNumber || !street) return { open: [], dismissed: [], total: 0 };
  try {
    // Match house number on either onstname or frstname (cross-street); DataTrace shows notices against both
    const records = await fetchNYCData(NYC_ENDPOINTS.DOT_SIDEWALK, {
      "$where": `house_num = '${houseNumber}' AND (upper(onstname) like '%${street.replace(/'/g, "''")}%' OR upper(frstname) like '%${street.replace(/'/g, "''")}%')`,
      "$limit": "100",
      "$order": "vissuedate DESC",
    }, 'DOT-SIDEWALK');

    console.log(`Sidewalk Violations: ${records.length} records for ${houseNumber} ${street}`);

    const mapped = records.map((r: any) => ({
      violation_id: r.violationid || null,
      swv_number: r.swv_number || null,
      issue_date: r.vissuedate || null,
      certified_date: r.certi_date || null,
      dismiss_date: r.vdismissdate || null,
      sq_feet: r.sq_feet || null,
      defects: [
        r.broken ? 'Broken' : null,
        r.trip_haz ? 'Trip hazard' : null,
        r.patchwork ? 'Patchwork' : null,
        r.sw_missing ? 'Sidewalk missing' : null,
        r.undermined ? 'Undermined' : null,
        r.slope ? 'Slope' : null,
        r.hardware ? 'Hardware' : null,
        r.integrity ? 'Integrity' : null,
      ].filter(Boolean),
      other_defects: r.other_def || null,
      from_street: r.frstname || null,
      to_street: r.tostname || null,
      on_street: r.onstname || null,
      house_num: r.house_num || null,
      contract: r.contract || null,
      grace_period: r.grace_pd || null,
    }));
    const open = mapped.filter((m: any) => !m.dismiss_date);
    const dismissed = mapped.filter((m: any) => !!m.dismiss_date);
    return { open, dismissed, total: mapped.length };
  } catch (error) {
    console.error("Sidewalk Violations fetch error:", error);
    return { open: [], dismissed: [], total: 0 };
  }
}

/**
 * HPD Emergency Repair charges — mirrors DataTrace "Emergency Repairs Violation Search".
 * Combines Open Market Orders and Handyman Work Orders (both are ERP lien types).
 */
async function fetchHPDEmergencyRepair(bin: string, bbl: string): Promise<any> {
  if (!bin && !bbl) return { omo: [], hwo: [], total: 0, total_charged: 0, lien_book_amount: 0 };
  try {
    const params: Record<string, string> = { "$limit": "100", "$order": "omocreatedate DESC" };
    if (bin) params['bin'] = bin;
    else if (bbl) params['bbl'] = bbl;

    const hwoParams: Record<string, string> = { "$limit": "100", "$order": "hwocreatedate DESC" };
    if (bin) hwoParams['bin'] = bin;
    else if (bbl) hwoParams['bbl'] = bbl;

    const [omoRecords, hwoRecords] = await Promise.all([
      fetchNYCData(NYC_ENDPOINTS.HPD_OMO, params, 'HPD-OMO'),
      fetchNYCData(NYC_ENDPOINTS.HPD_HWO, hwoParams, 'HPD-HWO'),
    ]);

    console.log(`HPD ERP: ${omoRecords.length} OMOs, ${hwoRecords.length} HWOs for BIN ${bin}`);

    const omo = omoRecords.map((r: any) => ({
      omo_number: r.omonumber || null,
      work_type: r.worktypegeneral || null,
      description: r.omodescription || null,
      award_amount: parseFloat(r.omoawardamount || '0') || 0,
      net_change_orders: parseFloat(r.netchangeorders || '0') || 0,
      create_date: r.omocreatedate || null,
      award_date: r.omoawarddate || null,
      lifecycle: r.lifecycle || null,
    }));
    const hwo = hwoRecords.map((r: any) => ({
      hwo_number: r.hwonumber || null,
      work_type: r.worktypegeneral || null,
      description: r.hwodescription || null,
      charge_amount: parseFloat(r.chargeamount || '0') || 0,
      approved_amount: parseFloat(r.hwoapprovedamount || '0') || 0,
      admin_fee: parseFloat(r.adminfee || '0') || 0,
      sales_tax: parseFloat(r.salestax || '0') || 0,
      create_date: r.hwocreatedate || null,
      status_reason: r.hwostatusreason || null,
      lifecycle: r.lifecycle || null,
    }));

    const totalCharged =
      omo.reduce((sum: number, r: any) => sum + r.award_amount + r.net_change_orders, 0) +
      hwo.reduce((sum: number, r: any) => sum + r.charge_amount, 0);

    return {
      omo,
      hwo,
      total: omo.length + hwo.length,
      total_charged: Math.round(totalCharged * 100) / 100,
      lien_book_amount: 0,  // pre-1999 ERP liens — not in this dataset (DataTrace separate book)
    };
  } catch (error) {
    console.error("HPD Emergency Repair fetch error:", error);
    return { omo: [], hwo: [], total: 0, total_charged: 0, lien_book_amount: 0 };
  }
}

/**
 * FDNY Violations — already in search-property, plumb into DD report.
 * Mirrors DataTrace "Record of existing Fire Department Violations".
 */
async function fetchFDNYViolationsDirect(bin: string): Promise<any> {
  if (!bin) return { open: [], closed: [], total: 0, total_penalty: 0 };
  try {
    const records = await fetchNYCData(NYC_ENDPOINTS.FDNY_VIOLATIONS_DD, {
      "bin": bin,
      "$limit": "200",
      "$order": "inspection_date DESC",
    }, 'FDNY-DD');

    console.log(`FDNY Violations (DD): ${records.length} records for BIN ${bin}`);

    const mapped = records.map((r: any) => {
      const status = (r.status || r.violation_status || '').toLowerCase();
      const isResolved = status.includes('close') || status.includes('resolved') || status.includes('cured') || status.includes('complied');
      return {
        violation_number: r.violation_number || r.issuance_number || null,
        violation_code: r.violation_code || null,
        description: r.violation_code_description || null,
        category: r.violation_category || null,
        inspection_date: r.inspection_date || r.violation_date || null,
        penalty_amount: parseFloat(r.penalty_amount || '0') || 0,
        status: isResolved ? 'closed' : 'open',
        comments: r.comments || null,
      };
    });
    const open = mapped.filter((m: any) => m.status === 'open');
    const closed = mapped.filter((m: any) => m.status === 'closed');
    const totalPenalty = open.reduce((sum: number, m: any) => sum + m.penalty_amount, 0);
    return { open, closed, total: mapped.length, total_penalty: Math.round(totalPenalty * 100) / 100 };
  } catch (error) {
    console.error("FDNY Violations (DD) fetch error:", error);
    return { open: [], closed: [], total: 0, total_penalty: 0 };
  }
}

/**
 * FDNY Building Vacate Orders — buildings declared unsafe by FDNY Fire Ops or BFP.
 * Critical — a vacate order means occupancy is legally prohibited until lifted.
 * Queried by BIN preferred, BBL fallback. Filters by status_change_date in last 25 years.
 */
async function fetchFDNYVacateOrders(bin: string, bbl: string): Promise<any> {
  if (!bin && !bbl) return { active: [], lifted: [], total: 0 };
  try {
    const filters: string[] = [];
    if (bin) filters.push(`bin = '${bin}'`);
    if (bbl) filters.push(`bbl = '${bbl}'`);
    const whereClause = filters.length === 2 ? `(${filters[0]} OR ${filters[1]})` : filters[0];

    const records = await fetchNYCData(NYC_ENDPOINTS.FDNY_VACATE, {
      "$where": whereClause,
      "$limit": "100",
      "$order": "date_of_vac_order DESC",
    }, 'FDNY-VACATE');

    console.log(`FDNY Vacate Orders: ${records.length} records for BIN ${bin} / BBL ${bbl}`);

    const mapped = records.map((r: any) => {
      const description = (r.description || '').toString();
      const occupancy = (r.ocpcy_desc || '').toString();
      // Heuristic: if status_change_date exists AND is more recent than vacate date with terms like "lifted"/"rescind"/"resc" — treat as lifted
      const desc = description.toLowerCase();
      const isLifted = desc.includes('lifted') || desc.includes('rescind') || desc.includes('resc') || desc.includes('vacated lifted') || desc.includes('vac. lifted') || desc.includes('vacate lifted');
      return {
        description,
        date_of_order: r.date_of_vac_order || null,
        last_inspection_date: r.lst_compl_insp_date || null,
        status_change_date: r.status_change_date || null,
        occupancy_description: occupancy,
        bin: r.bin || null,
        bbl: r.bbl || null,
        aka_address: r.aka_address || null,
        community_district: r.bldg_community_dist || null,
        council_district: r.council_district || null,
        is_lifted: isLifted,
      };
    });
    const active = mapped.filter((m: any) => !m.is_lifted);
    const lifted = mapped.filter((m: any) => m.is_lifted);
    return { active, lifted, total: mapped.length };
  } catch (error) {
    console.error("FDNY Vacate Orders fetch error:", error);
    return { active: [], lifted: [], total: 0 };
  }
}

/**
 * Bureau of Fire Prevention — Active Violation Orders (Historical, bi53-yph3).
 * Source database decommissioned 2024-03-14 but remains an authoritative archive
 * of FDNY BFP violation orders — cross-references our live FDNY_VIOLATIONS feed
 * and surfaces older orders the live API may not return.
 */
async function fetchFDNYBureauViolations(bin: string): Promise<any> {
  if (!bin) return { items: [], total: 0 };
  try {
    const records = await fetchNYCData(NYC_ENDPOINTS.FDNY_BFP_ACTIVE, {
      "$where": `bin = '${bin}'`,
      "$limit": "200",
      "$order": "violation_date DESC",
    }, 'FDNY-BFP');

    console.log(`FDNY BFP Active Violation Orders: ${records.length} records for BIN ${bin}`);

    const items = records.map((r: any) => ({
      account_number: r.account_num || r.acct_num || null,
      violation_number: r.viol_id || r.violation_number || null,
      violation_date: r.violation_date || r.viol_date || null,
      violation_status: r.violation_status || r.viol_status || null,
      violation_type: r.violation_type || null,
      description: r.violation_description || r.viol_description || null,
      premise_address: r.premise_address || r.address || null,
      bin: r.bin || null,
    }));
    return { items, total: items.length };
  } catch (error) {
    console.error("FDNY BFP fetch error:", error);
    return { items: [], total: 0 };
  }
}

async function generateAIAnalysis(reportData: any, customerConcern: string | null, LOVABLE_API_KEY: string): Promise<string> {
  const { building, violations, applications, orders, taxLienData } = reportData;
  const openViolations = violations.filter((v: any) => v.status === 'open');
  const dobV = openViolations.filter((v: any) => v.agency === 'DOB');
  const ecbV = openViolations.filter((v: any) => v.agency === 'ECB');
  const hpdV = openViolations.filter((v: any) => v.agency === 'HPD');

  const acrisData = reportData.acrisData || { documents: [], deeds: [], mortgages: [], liens: [] };

  const concernSection = customerConcern
    ? `\n\nCUSTOMER CONCERN: "${customerConcern}"\nPlease specifically address this concern in your analysis and conclusion.`
    : '';

  const acrisSection = acrisData.documents.length > 0
    ? `\n\nACRIS (Property Transfer & Lien History):
Deeds: ${acrisData.deeds.length} recorded transfers${acrisData.deeds.length > 0 ? ` — most recent: ${acrisData.deeds[0]?.document_date || 'Unknown'}, amount: $${acrisData.deeds[0]?.document_amount?.toLocaleString() || 'N/A'}` : ''}
Mortgages: ${acrisData.mortgages.length} recorded${acrisData.mortgages.length > 0 ? ` — most recent: ${acrisData.mortgages[0]?.document_date || 'Unknown'}, amount: $${acrisData.mortgages[0]?.document_amount?.toLocaleString() || 'N/A'}` : ''}
Liens: ${acrisData.liens.length} recorded`
    : '\n\nACRIS: No records found (may be a cooperative or records filed under a different lot).';

  const prompt = `Compile a factual summary of the following NYC property records. Report ONLY what the data shows — counts, dates, amounts, statuses, and document types. Do NOT assign risk levels, characterize findings (e.g., "excellent," "concerning," "red flag"), offer opinions, provide recommendations, or use advisory language (e.g., "should," "recommend," "caution," "consider").

PROPERTY: ${building?.address || 'Unknown'} | BIN: ${building?.bin || 'Unknown'} | BBL: ${building?.bbl || 'Unknown'}
Year Built: ${building?.year_built || 'Unknown'} | Stories: ${building?.stories || 'Unknown'} | Units: ${building?.dwelling_units || 'Unknown'}
Zoning: ${building?.zoning_district || 'Unknown'} | Landmark: ${building?.is_landmark ? 'Yes' : 'No'} | Owner: ${building?.owner_name || 'Unknown'}

VIOLATIONS: ${openViolations.length} total open (DOB: ${dobV.length}, ECB: ${ecbV.length}, HPD: ${hpdV.length})
Stop Work Orders: ${orders.stop_work?.length || 0} | Vacate Orders: ${orders.vacate?.length || 0}

OPEN VIOLATIONS:
${openViolations.slice(0, 15).map((v: any) => `- [${v.agency}] ${v.violation_number || 'N/A'}: ${v.violation_type || v.description_raw || 'No description'}. Issued: ${v.issued_date || 'Unknown'}. Status: ${v.status || 'open'}.${v.penalty_amount ? ` Outstanding penalty: $${parseFloat(v.penalty_amount).toLocaleString()}.` : ''}`).join('\n') || 'None'}

APPLICATIONS: ${applications.length} total active
${applications.slice(0, 8).map((a: any) => `- [${a.source}] ${a.application_number || 'N/A'}: ${a.application_type || a.job_type || 'Unknown'}. Filed: ${a.filing_date || 'Unknown'}. Status: ${a.status || 'Unknown'}.${a.job_description ? ` Desc: ${a.job_description}` : ''}`).join('\n') || 'None'}
${acrisSection}

TAX LIEN SALE STATUS: ${(taxLienData || []).length > 0 ? `Property appears on the Tax Lien Sale List with ${(taxLienData || []).length} record(s).` : 'Not on the Tax Lien Sale List.'}
${concernSection}

Structure your response with these sections:
1. **Property Overview** — Building type, age, zoning, owner of record.
2. **Open Violations** — List each open violation by agency with number, type, date issued, and any outstanding penalties. State total ECB penalty balance.
3. **Active Permits & Applications** — List each active application with type, filing date, and current status.
4. **Ownership & Recorded Documents** — State most recent deed holder, purchase date and amount, most recent mortgage, and count of recorded liens.
5. **Tax Lien Status** — State whether the property is on the lien sale list.
${customerConcern ? `6. **Stated Area of Interest** — Identify which open items from the data relate to: "${customerConcern}". List them by number. Do not advise.` : ''}

CRITICAL RULES:
- State facts and data only. No adjectives like "clean," "excellent," "significant," "strong," "concerning."
- No risk levels, risk ratings, or risk characterizations.
- No recommendations, next steps, or action items.
- No advisory language whatsoever.
- If data is missing or unavailable, state "Not available" — do not speculate.
- TERMINOLOGY: Certificate of Occupancy must be abbreviated as "CO" or "TCO" (Temporary CO). Never use "COI."
- MORTGAGE/FINANCIAL DATA: State only the recorded amounts, dates, and parties. Do NOT interpret mortgage amounts relative to purchase price. Do NOT speculate about equity, financial position, loan balances, or whether the property is "free and clear." ACRIS records show only what was recorded at the time of filing — they do not reflect current balances, payoffs, or refinancing.`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a factual data summarizer for NYC real estate due diligence. You report ONLY what the records show. You never assign risk levels, characterize findings subjectively, offer opinions, or provide recommendations. Your output reads like a neutral audit log, not an advisory memo." },
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
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Clear error tracker for this request
    agencyErrors.clear();
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
    const requestBody = await req.json();
    const { reportId, address, customerConcern } = requestBody;

    // ── date_down action — rerun DOF PTAPS + DEP CIS only ($49 add-on) ────────────────
    if (requestBody?.action === "date_down") {
      const ddBbl: string = requestBody?.bbl ?? '';
      const ddAddress: string | undefined = requestBody?.address;
      if (!ddBbl || ddBbl.length < 10) {
        return new Response(
          JSON.stringify({ error: "bbl is required for date_down action (must be 10-digit)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const ddResult = await fetchDateDown(ddBbl, ddAddress);
      // If a report_id is provided, update the cached columns in dd_reports
      if (requestBody?.report_id) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        await supabase.from('dd_reports').update({
          ...(ddResult.dof !== null ? { dof_charges_data: ddResult.dof } : {}),
          ...(ddResult.dep !== null ? { dep_charges_data: ddResult.dep } : {}),
          dof_source: ddResult.dof_source === "ptaps_live" ? "ptaps_live" : "unavailable",
          dep_source: ddResult.dep_source === "cis_live" ? "cis_live" : "unavailable",
          dof_fetched_at: ddResult.dof_fetched_at,
          dep_fetched_at: ddResult.dep_fetched_at,
        }).eq('id', requestBody.report_id);
      }
      return new Response(
        JSON.stringify(ddResult),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // ──────────────────────────────────────────────────────────────────

    if (!reportId || !address) {
      return new Response(JSON.stringify({ error: "Missing reportId or address" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Rate limit: 5 report generations / hour per user. Protects against runaway
    // LLM gateway costs from a buggy retry loop or a malicious actor with a
    // valid token. Admins are still subject to the limit; raise the cap if it's
    // ever a problem.
    const rl = await checkRateLimit(supabase, {
      key: `report:${userId}`,
      limit: 5,
      windowMinutes: 60,
      corsHeaders,
    });
    if (rl.limited) return rl.response;

    // Ownership check: caller must own the report (or be an admin).
    // Prevents authenticated user A from regenerating/overwriting user B's report.
    const { data: reportRow, error: reportLookupError } = await supabase
      .from('dd_reports')
      .select('id, user_id, subject_type, subject_unit, scope_of_work, requested_by_role')
      .eq('id', reportId)
      .maybeSingle();

    if (reportLookupError || !reportRow) {
      return new Response(JSON.stringify({ error: "Report not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (reportRow.user_id !== userId) {
      // Allow admins to regenerate any report
      const { data: adminCheck } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();
      if (!adminCheck) {
        console.warn(`Ownership violation: user ${userId} attempted to regenerate report ${reportId} owned by ${reportRow.user_id}`);
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

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

    // Determine if property is residential based on PLUTO landuse codes
    // 01 = One & Two Family, 02 = Multi-Family Walk-Up, 03 = Multi-Family Elevator
    const landuse = building?.land_use || '';
    const isResidentialProperty = ['01', '02', '03'].includes(landuse);
    console.log(`Property type: landuse=${landuse}, isResidential=${isResidentialProperty}`);

    // Fetch violations, applications, complaints, ACRIS, tax liens, and Coverage Exceed sources in parallel
    const [
      allViolations, rawApplications, complaints, acrisData, taxLienData,
      // Coverage Exceed v1 — DataTrace parity
      dofCharges, fuelBurners, certificatesOfOccupancy, sidewalkViolations, hpdEmergencyRepair, fdnyDirectViolations,
      // Coverage Exceed v2 (PR #5) — Vacate Orders + BFP archive
      fdnyVacateData, fdnyBureauData,
    ] = await Promise.all([
      fetchViolations(bin, bbl, isResidentialProperty),
      fetchApplications(bin),
      fetchDOBComplaints(bin),
      fetchACRISData(bbl),
      fetchTaxLienData(bbl),
      // Coverage Exceed v1
      // fetchDOFCharges already handles USE_LIVE_DOF internally
      fetchDOFCharges(bbl),
      fetchFuelBurners(bin),
      fetchCertificatesOfOccupancy(bin),
      fetchSidewalkViolations(building),
      fetchHPDEmergencyRepair(bin, bbl),
      fetchFDNYViolationsDirect(bin),
      // Coverage Exceed v2
      fetchFDNYVacateOrders(bin, bbl),
      fetchFDNYBureauViolations(bin),
    ]);

    // ── Step 6: Live DEP CIS water/sewer (feature flag: USE_LIVE_DEP=true) ─────────────────
    // Runs after the parallel block so it doesn't block the critical-path fetches.
    // On error/timeout, falls back to the WAT/SEW items already in dofCharges.
    const useLiveDEP = Deno.env.get("USE_LIVE_DEP") === "true";
    let depCharges: any = null; // null = use Socrata WAT/SEW items from dofCharges
    if (useLiveDEP && bbl) {
      const liveDepData = await fetchDEPLive(bbl, resolvedAddress ?? undefined);
      if (liveDepData !== null) {
        console.log(`[generate-dd-report] Using live DEP CIS data for BBL ${bbl}`);
        depCharges = { ...liveDepData, _source: "cis_live" };
      } else {
        console.warn(`[generate-dd-report] USE_LIVE_DEP=true but live DEP fetch failed for BBL ${bbl} — using Socrata WAT/SEW from dofCharges`);
      }
    }

    // Determine provenance strings for the PrintView footnote
    const dofSource: string = (dofCharges as any)?._source === "ptaps_live" ? "ptaps_live"
      : (dofCharges as any)?._source === "socrata" ? "socrata" : "socrata";
    const depSource: string = depCharges?._source === "cis_live" ? "cis_live" : "socrata";
    const dofFetchedAt: string | null = (dofCharges as any)?._fetched_at ?? null;
    const depFetchedAt: string | null = depCharges?._fetched_at ?? null;
    console.log(`[generate-dd-report] dof_source=${dofSource}, dep_source=${depSource}`);
    // ─────────────────────────────────────────────────────────────────────────────────────

    // Build agencies_queried tracking
    const dobViolationsFromAll = allViolations.filter((v: any) => v.agency === 'DOB');
    const ecbViolationsFromAll = allViolations.filter((v: any) => v.agency === 'ECB');
    const hpdViolationsFromAll = allViolations.filter((v: any) => v.agency === 'HPD');
    const fdnyViolationsFromAll = allViolations.filter((v: any) => v.agency === 'FDNY');
    const depViolationsFromAll = allViolations.filter((v: any) => v.agency === 'DEP');
    const dotViolationsFromAll = allViolations.filter((v: any) => v.agency === 'DOT');
    const dsnyViolationsFromAll = allViolations.filter((v: any) => v.agency === 'DSNY');
    const lpcViolationsFromAll = allViolations.filter((v: any) => v.agency === 'LPC');
    const dofViolationsFromAll = allViolations.filter((v: any) => v.agency === 'DOF');

    const bisAppsCount = rawApplications.filter((a: any) => a.source === 'BIS').length;
    const dobNowAppsCount = rawApplications.filter((a: any) => a.source === 'DOB_NOW').length;
    const acrisDocs = acrisData?.documents?.length || 0;

    const agenciesQueried = [
      { agency: 'DOB', label: 'Dept of Buildings', queried: true, results: dobViolationsFromAll.length, category: 'violations', error: agencyErrors.has('DOB') },
      { agency: 'ECB', label: 'ECB/OATH', queried: true, results: ecbViolationsFromAll.length, category: 'violations', error: agencyErrors.has('ECB') },
      { agency: 'HPD', label: 'Housing Preservation', queried: isResidentialProperty && !!bbl, results: hpdViolationsFromAll.length, category: 'violations', error: agencyErrors.has('HPD'), ...((!isResidentialProperty) ? { note: 'Skipped — commercial property' } : {}) },
      { agency: 'FDNY', label: 'Fire Department', queried: true, results: fdnyViolationsFromAll.length, category: 'violations', error: agencyErrors.has('FDNY') },
      { agency: 'DEP', label: 'Environmental Protection', queried: !!bbl, results: depViolationsFromAll.length, category: 'violations', error: agencyErrors.has('DEP') },
      { agency: 'DOT', label: 'Transportation', queried: !!bbl, results: dotViolationsFromAll.length, category: 'violations', error: agencyErrors.has('DOT') },
      { agency: 'DSNY', label: 'Sanitation', queried: !!bbl, results: dsnyViolationsFromAll.length, category: 'violations', error: agencyErrors.has('DSNY') },
      { agency: 'LPC', label: 'Landmarks', queried: !!bbl, results: lpcViolationsFromAll.length, category: 'violations', error: agencyErrors.has('LPC') },
      { agency: 'DOF', label: 'Dept of Finance', queried: !!bbl, results: dofViolationsFromAll.length, category: 'violations', error: agencyErrors.has('DOF') },
      { agency: 'DOB-BIS', label: 'DOB BIS Applications', queried: !!bin, results: bisAppsCount, category: 'applications', error: agencyErrors.has('DOB-BIS') },
      { agency: 'DOB-NOW', label: 'DOB NOW Applications', queried: !!bin, results: dobNowAppsCount, category: 'applications', error: agencyErrors.has('DOB-NOW') },
      { agency: 'DOB-COMPLAINTS', label: 'DOB Complaints', queried: !!bin, results: complaints.length, category: 'complaints', error: agencyErrors.has('DOB-COMPLAINTS') },
      { agency: 'ACRIS', label: 'ACRIS Property Records', queried: !!bbl, results: acrisDocs, category: 'transfers', error: agencyErrors.has('ACRIS') },
      { agency: 'DOF-LIEN', label: 'Tax Lien Sale List', queried: !!bbl, results: taxLienData.length, category: 'tax_liens', error: agencyErrors.has('DOF-LIEN') },
      // Coverage Exceed v1 — DataTrace parity
      { agency: 'DOF-CHARGES', label: 'DOF Property Charges', queried: !!bbl, results: dofCharges.totals.count, category: 'charges', error: agencyErrors.has('DOF-CHARGES'), source: dofSource },
      { agency: 'DEP-CIS', label: 'DEP Water/Sewer (CIS)', queried: useLiveDEP && !!bbl, results: depCharges?.totals?.count ?? 0, category: 'charges', error: false, source: depSource },
      { agency: 'DEP-FUEL', label: 'DEP Air Resources / Fuel Burners', queried: !!bin, results: fuelBurners.total, category: 'equipment', error: agencyErrors.has('DEP-FUEL') },
      { agency: 'DOB-CO', label: 'Certificates of Occupancy', queried: !!bin, results: certificatesOfOccupancy.total, category: 'certificates', error: agencyErrors.has('DOB-CO') },
      { agency: 'DOT-SIDEWALK', label: 'DOT Sidewalk Violations', queried: !!building?.street_name, results: sidewalkViolations.total, category: 'violations', error: agencyErrors.has('DOT-SIDEWALK') },
      { agency: 'HPD-OMO', label: 'HPD Emergency Repair (OMO)', queried: !!(bin || bbl), results: hpdEmergencyRepair.omo.length, category: 'charges', error: agencyErrors.has('HPD-OMO') },
      { agency: 'HPD-HWO', label: 'HPD Handyman Work Orders', queried: !!(bin || bbl), results: hpdEmergencyRepair.hwo.length, category: 'charges', error: agencyErrors.has('HPD-HWO') },
      { agency: 'FDNY-DD', label: 'FDNY Violations (Direct)', queried: !!bin, results: fdnyDirectViolations.total, category: 'violations', error: agencyErrors.has('FDNY-DD') },
      // Coverage Exceed v2 (PR #5)
      { agency: 'FDNY-VACATE', label: 'FDNY Building Vacate Orders', queried: !!(bin || bbl), results: fdnyVacateData.total, category: 'orders', error: agencyErrors.has('FDNY-VACATE') },
      { agency: 'FDNY-BFP', label: 'Bureau of Fire Prevention Orders', queried: !!bin, results: fdnyBureauData.total, category: 'violations', error: agencyErrors.has('FDNY-BFP') },
    ];
    const errorAgencies = agenciesQueried.filter(a => a.error);
    console.log(`Agencies queried: ${agenciesQueried.filter(a => a.queried).length}, with data: ${agenciesQueried.filter(a => a.results > 0).length}, with errors: ${errorAgencies.length} (${errorAgencies.map(a => a.agency).join(', ')})`);

    // CRITICAL: Filter out closed/resolved/dismissed violations — report must only contain open items
    const CLOSED_STATUSES = ['closed', 'resolved', 'dismissed', 'paid', 'complied', 'certified closed'];
    const violations = allViolations.filter((v: any) => {
      const status = (v.status || '').toLowerCase();
      if (CLOSED_STATUSES.includes(status)) return false;
      if (status.includes('close') || status.includes('dismiss') || status.includes('resolved') || status.includes('complied')) return false;
      return true;
    });
    console.log(`Violations: ${allViolations.length} total → ${violations.length} open (filtered ${allViolations.length - violations.length} closed)`);

    const seenApps = new Set<string>();
    const applications = rawApplications.filter((app: any) => {
      const key = `${app.source || 'BIS'}-${app.application_number}`;
      if (seenApps.has(key)) return false;
      seenApps.add(key);
      // Exclude terminal-state applications (signed-off, completed, old withdrawn)
      const { tag } = classifyApplication(app);
      if (tag === 'EXCLUDE') return false;
      return true;
    });
    console.log(`Applications: ${rawApplications.length} total → ${applications.length} active (filtered ${rawApplications.length - applications.length} completed/signed-off)`);

    const orders = {
      stop_work: violations.filter(v => v.is_stop_work_order && !v.is_partial_stop_work),
      partial_stop_work: violations.filter(v => v.is_partial_stop_work),
      vacate: violations.filter(v => v.is_vacate_order),
    };

    // Fetch learning context (few-shot examples + knowledge entries) before generating notes
    const agencies = [...new Set(violations.map((v: any) => v.agency))];
    const learningContext = await fetchLearningExamples(supabaseUrl, supabaseServiceKey, agencies);
    console.log(`Learning context: ${learningContext.few_shot_examples.length} few-shot categories, ${learningContext.knowledge_context.length} knowledge entries, ${learningContext.confidence_flags.length} flags`);

    // Generate line-item notes and property status summary in parallel (AI analysis removed)
    const [lineItemNotes, propertyStatusSummary] = await Promise.all([
      generateLineItemNotes(
        violations, applications, resolvedAddress, customerConcern || null, LOVABLE_API_KEY, learningContext,
        {
          subjectType: (reportRow as any).subject_type || 'building',
          subjectUnit: (reportRow as any).subject_unit || null,
          scopeOfWork: (reportRow as any).scope_of_work || null,
          requestedByRole: (reportRow as any).requested_by_role || null,
        }
      ),
      generatePropertyStatusSummary(
        building || { address: resolvedAddress, bin, bbl },
        violations, applications, complaints, orders,
        customerConcern || null,
        LOVABLE_API_KEY
      ),
    ]);

    // Determine CitiSignal recommendation based on building size
    const bldg = building || {};
    const unitsRes = parseInt(bldg.dwelling_units || bldg.unitsres || '0') || 0;
    const unitsTotal = parseInt(bldg.unitstotal || '0') || 0;
    const numFloors = parseInt(bldg.stories || bldg.numfloors || '0') || 0;
    const citisignalRecommended = unitsRes > 3 || unitsTotal > 5 || numFloors > 3;
    console.log(`CitiSignal recommendation: ${citisignalRecommended} (units_res=${unitsRes}, units_total=${unitsTotal}, floors=${numFloors})`);

    // Coverage Exceed — build agency-direct deep links for the report header
    const externalLinks = {
      co_lookup: bin ? buildCOPdfUrl(bin) : null,
      tax_map: bbl ? buildTaxMapUrl(bbl) : null,
      dof_account: bbl ? buildDOFAccountUrl(bbl) : null,
      acris_bbl: bbl ? buildACRISBblUrl(bbl) : null,
      // PR #5 — portal landings for analyst follow-up
      acris_search: buildACRISSearchUrl(),
      dep_portal: buildDEPPortalUrl(),
      fdny_business_portal: buildFDNYBusinessPortalUrl(),
    };

    const { error: updateError } = await supabase.from('dd_reports').update({
      bin: bin || null, bbl: bbl || null,
      building_data: building || { address: resolvedAddress, bin, bbl },
      violations_data: violations, applications_data: applications, orders_data: orders,
      complaints_data: complaints,
      acris_data: acrisData,
      tax_lien_data: taxLienData,
      // Coverage Exceed v1 — DataTrace parity
      dof_charges_data: dofCharges,
      dep_charges_data: depCharges,   // null when USE_LIVE_DEP is off; WAT/SEW in dofCharges used instead
      fuel_tank_data: fuelBurners,
      co_data: certificatesOfOccupancy,
      sidewalk_data: sidewalkViolations,
      hpd_erp_data: hpdEmergencyRepair,
      fdny_direct_data: fdnyDirectViolations,
      // Coverage Exceed v2 (PR #5)
      fdny_vacate_data: fdnyVacateData,
      fdny_bfp_data: fdnyBureauData,
      external_links: externalLinks,
      agencies_queried: agenciesQueried,
      ai_analysis: null,
      line_item_notes: lineItemNotes,
      property_status_summary: propertyStatusSummary || null,
      citisignal_recommended: citisignalRecommended,
      // Step 6 — provenance columns (from migration 20260614040000_dof_dep_live_cache.sql)
      dof_source: dofSource,
      dep_source: depSource,
      dof_fetched_at: dofFetchedAt,
      dep_fetched_at: depFetchedAt,
      status: 'pending_review',
    }).eq('id', reportId);

    if (updateError) throw updateError;
    console.log(`=== Report generated successfully with ${lineItemNotes.length} line-item notes ===`);

    // PR #7 — seed manual-pull document tickets for the analyst queue.
    // Every NYC agency we cover blocks automated PDF retrieval (ACRIS
    // bandwidth policy + DOB BIS Akamai 403), so each document becomes
    // a ticket the analyst opens via the source_url, downloads manually,
    // and uploads back through the /admin/documents queue.
    try {
      const docTickets: Array<{
        agency: string;
        doc_type: string;
        doc_ref?: string | null;
        title?: string | null;
        source_url?: string | null;
        priority?: number;
      }> = [];

      // ACRIS documents (deeds, mortgages, liens, etc.)
      const acrisDocs = (acrisData?.documents || []) as any[];
      for (const d of acrisDocs) {
        if (!d?.document_id) continue;
        const dt = (d.document_type || 'document').toLowerCase();
        const isLien = ['lien', 'fedl', 'mech', 'judgm', 'ucc1', 'ucc3'].some(t => dt.includes(t));
        const isDeed = ['deed', 'rptt'].some(t => dt.includes(t));
        docTickets.push({
          agency: 'ACRIS',
          doc_type: isLien ? 'lien' : isDeed ? 'deed' : dt.includes('mtge') ? 'mortgage' : 'document',
          doc_ref: d.document_id,
          title: `ACRIS ${d.document_type || 'doc'} - ${d.recorded_date || d.document_date || ''}`.trim(),
          source_url: d.image_view_url || d.detail_url,
          // Liens are highest priority for due-diligence buyers.
          priority: isLien ? 1 : isDeed ? 3 : 5,
        });
      }

      // DOB Certificates of Occupancy (PDFs live behind BIS).
      const coDocs = (certificatesOfOccupancy?.records || []) as any[];
      for (const c of coDocs) {
        if (!c?.job_number) continue;
        docTickets.push({
          agency: 'DOB',
          doc_type: 'co',
          doc_ref: String(c.job_number),
          title: `DOB Certificate of Occupancy - job ${c.job_number}`,
          source_url: `http://a810-bisweb.nyc.gov/bisweb/CofoJobDocumentServlet?passjobnumber=${c.job_number}&fillerdata=A`,
          priority: 2,
        });
      }

      // FDNY Vacate Orders - if there's an active vacate, that's a buyer-killer.
      const vacateOrders = (fdnyVacateData?.orders || []) as any[];
      for (const v of vacateOrders) {
        const ref = v.vacate_order_number || v.violation_number || v.acct_num;
        if (!ref) continue;
        docTickets.push({
          agency: 'FDNY',
          doc_type: 'vacate_order',
          doc_ref: String(ref),
          title: `FDNY Vacate Order ${ref}`,
          source_url: 'https://fires.fdnycloud.org/CitizenAccess/Default.aspx',
          priority: 1, // Vacate orders block sales — highest priority.
        });
      }

      if (docTickets.length > 0) {
        const { error: seedErr } = await supabase.rpc('seed_report_documents' as any, {
          _report_id: reportId,
          _docs: docTickets,
        });
        if (seedErr) {
          console.warn('Failed to seed report documents:', seedErr);
        } else {
          console.log(`Seeded ${docTickets.length} document tickets for analyst queue`);
        }
      }
    } catch (seedException) {
      // Never let the document-seeding step fail the whole report.
      console.warn('Document seeding skipped due to error:', seedException);
    }

    // ── Phase 0: Compliance Plant snapshot (best-effort, non-fatal) ─────────
    // Writes a canonical, hashed snapshot of the report's compliance data to
    // compliance_snapshots so CitiSignal (Phase 1) can diff against it later.
    // MUST never fail the parent report generation — wrap in try/catch.
    try {
      if (bin && bbl) {
        const snapshotData: ComplianceSnapshotData = {
          violations: violations.filter((v: any) => v.agency === 'DOB'),
          ecb: violations.filter((v: any) => v.agency === 'ECB'),
          hpd_violations: violations.filter((v: any) => v.agency === 'HPD'),
          fdny_violations: violations.filter((v: any) => v.agency === 'FDNY'),
          permits_open: applications.filter((a: any) => a.source === 'BIS'),
          permits_dob_now: applications.filter((a: any) => a.source === 'DOB_NOW'),
          tax_status: {
            balance: (dofCharges as any)?.totals?.amount_due ?? undefined,
            delinquent: ((dofCharges as any)?.totals?.amount_due ?? 0) > 0,
          },
          water_status: {
            balance: (depCharges as any)?.totals?.amount_due
              ?? (dofCharges as any)?.totals?.water_sewer_amount
              ?? undefined,
          },
          active_orders: extractActiveOrders(violations as Array<Record<string, unknown>>),
          landmarked: !!(building as any)?.is_landmark,
          sidewalk_violations: Array.isArray(sidewalkViolations)
            ? sidewalkViolations
            : ((sidewalkViolations as any)?.records ?? []),
        };

        const dataHash = await hashSnapshotData(snapshotData);
        const fetchedAt = new Date().toISOString();
        const useLiveBIS = Deno.env.get("USE_LIVE_BIS") === "true";
        const useLiveDOF = Deno.env.get("USE_LIVE_DOF") === "true";

        const sources = buildSourceProvenance({
          useLiveBIS,
          useLiveDOF,
          useLiveDEP,
          dofFellBackToSocrata: useLiveDOF && dofSource !== "ptaps_live",
          depFellBackToSocrata: useLiveDEP && depSource !== "cis_live",
          bisFellBackToSocrata: false,
          fetchedAt,
          counts: {
            dob_violations: snapshotData.violations.length,
            ecb_violations: snapshotData.ecb.length,
            hpd_violations: snapshotData.hpd_violations.length,
            fdny_violations: snapshotData.fdny_violations.length,
            bis_jobs: snapshotData.permits_open.length,
            dob_now_build: snapshotData.permits_dob_now.length,
            sidewalk_violations: snapshotData.sidewalk_violations.length,
          },
          balances: {
            dof_tax_balance: snapshotData.tax_status.balance,
            dep_water_balance: snapshotData.water_status.balance,
          },
        });

        const { error: snapErr } = await supabase.from('compliance_snapshots').insert({
          bin: String(bin),
          bbl: String(bbl),
          address: resolvedAddress || (building as any)?.address || '',
          borough: (building as any)?.borough ?? null,
          report_id: reportId,
          subject_type: (reportRow as any)?.subject_type ?? null,
          subject_unit: (reportRow as any)?.subject_unit ?? null,
          scope_of_work: (reportRow as any)?.scope_of_work ?? null,
          sources,
          data: snapshotData,
          data_hash: dataHash,
          as_of: fetchedAt,
        });

        if (snapErr) {
          // Most likely the migration hasn't been applied yet — log and continue.
          console.warn('[plant] compliance_snapshots write skipped:', snapErr.message ?? snapErr);
        } else {
          console.log(`[plant] snapshot written: bin=${bin} hash=${dataHash.slice(0, 12)}`);
        }
      }
    } catch (snapException) {
      // Never let plant writes fail the report.
      console.warn('[plant] snapshot exception (non-fatal):', snapException);
    }

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
