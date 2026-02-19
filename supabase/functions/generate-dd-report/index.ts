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
};

const BOROUGH_CODES: Record<string, string> = {
  "MANHATTAN": "1", "MN": "1", "NEW YORK": "1",
  "BRONX": "2", "BX": "2", "THE BRONX": "2",
  "BROOKLYN": "3", "BK": "3", "KINGS": "3",
  "QUEENS": "4", "QN": "4",
  "STATEN ISLAND": "5", "SI": "5", "RICHMOND": "5",
};

async function fetchNYCData(endpoint: string, params: Record<string, string>): Promise<any[]> {
  const url = new URL(endpoint);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
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
  }
  return violations;
}

const EXCLUDED_STATUS_CODES = ['X', 'U', 'I'];
const EXCLUDED_STATUS_NAMES = ['signed-off', 'completed', 'signoff', 'sign-off'];

function shouldExcludeApplication(status: string | null, statusCode?: string | null): boolean {
  const statusLower = (status || '').toLowerCase().trim();
  const codeUpper = (statusCode || '').toUpperCase().trim();
  const statusUpper = (status || '').toUpperCase().trim();
  if (EXCLUDED_STATUS_CODES.includes(codeUpper)) return true;
  if (EXCLUDED_STATUS_CODES.includes(statusUpper)) return true;
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

async function fetchApplications(bin: string): Promise<any[]> {
  const applications: any[] = [];
  if (!bin) return applications;

  const dobJobs = await fetchNYCData(NYC_ENDPOINTS.DOB_JOBS, {
    "bin__": bin, "$limit": "200", "$order": "latest_action_date DESC",
  });

  const bisApps = dobJobs.map((j: any) => {
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
      applicant_name: j.applicant_s_first_name && j.applicant_s_last_name ? `${j.applicant_s_first_name} ${j.applicant_s_last_name}` : null,
    };
  }).filter((app: any) => !shouldExcludeApplication(app.status, app.status_code));
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
  const concernText = customerConcern
    ? `The customer's specific concern: "${customerConcern}"`
    : "No specific customer concern was provided. Write general impact notes.";

  // Build compact item list for AI
  const violationItems = violations.slice(0, 60).map((v: any) => ({
    type: "violation",
    id: v.violation_number || v.id,
    agency: v.agency,
    desc: (v.violation_type || v.description_raw || 'Unknown').slice(0, 100),
    floor: v.story || null,
    apt: v.apartment || null,
  }));

  const applicationItems = applications.slice(0, 40).map((a: any) => ({
    type: "application",
    id: `${a.source || 'BIS'}-${a.application_number || a.id}`,
    source: a.source,
    desc: (a.job_description || a.application_type || 'Unknown').slice(0, 100),
    floor: a.floor || null,
    apt: a.apartment || null,
  }));

  const allItems = [...violationItems, ...applicationItems];
  if (allItems.length === 0) return [];

  const prompt = `You are reviewing NYC DOB/ECB/HPD records for ${address}.
${concernText}

For EACH item below, write a brief note (under 15 words) assessing its relevance/impact.
Format: "[brief what it is]; [impact assessment relative to concern]"
Examples:
- "related to elevator; no impact on unit 10B"
- "exterior facade repairs floors 1-ROF; no impact on unit 10B"
- "LAA for kitchen work apt 3G; unrelated to 10th floor"
- "gas piping violation; building-wide concern, verify compliance"

Items to review:
${JSON.stringify(allItems, null, 2)}`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You generate brief per-item notes for NYC property due diligence reports. Return structured JSON via the tool call." },
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

    // Save customer concern if provided
    if (customerConcern) {
      await supabase.from('dd_reports').update({ customer_concern: customerConcern }).eq('id', reportId);
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
