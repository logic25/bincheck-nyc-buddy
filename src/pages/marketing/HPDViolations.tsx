import AgencyLanding, { AgencyLanderConfig } from "./AgencyLandingTemplate";

const config: AgencyLanderConfig = {
  slug: "hpd-violations",
  seoTitle: "NYC HPD Violations Search — Class A, B, C Housing Violations",
  seoDescription: "Search NYC HPD housing violations by class (A, B, C). Includes immediately hazardous, hazardous, and non-hazardous items. Attorney-ready PDF in 24–48 hours. $499 flat.",
  eyebrow: "HPD violations",
  h1: "NYC HPD Violations Search",
  subtitle: "NYC Housing Preservation & Development violations by class — Class A (non-hazardous), Class B (hazardous), and Class C (immediately hazardous) — with cure status, certification deadlines, and AI line-item analysis.",
  serviceName: "NYC HPD Violations Report",
  whatItIs: {
    title: "What are HPD violations, and how do classes work?",
    paragraphs: [
      "The NYC Department of Housing Preservation & Development (HPD) inspects multifamily residential buildings and issues violations for housing-code breaches. HPD violations are graded by hazard class: A (non-hazardous, like minor paint), B (hazardous, like broken locks or vermin), and C (immediately hazardous, like no heat, lead paint exposure, or rodent infestation).",
      "Class C violations carry the steepest legal exposure. They can trigger 7A administrators, rent reductions, and tenant lawsuits. They also reset clocks on tenant warranty-of-habitability claims, which can be retroactively asserted against a buyer for the prior owner's violations.",
      "BinCheckNYC pulls every HPD violation on a property, sorts by class, surfaces cure status and certification deadlines, and flags items that could create exposure for an incoming buyer or lender. Especially critical for residential acquisitions, multifamily refinances, and tenant-in-place transactions.",
    ],
  },
  whatsIncluded: [
    "All open HPD violations by class — A (non-hazardous), B (hazardous), C (immediately hazardous)",
    "Certification status and deadlines, including overdue and re-certified items",
    "Lead paint exposure flags (Local Law 1, Local Law 31) — critical for buildings with children under 6",
    "Heat & hot water complaints and seasonal HPD enforcement history",
    "Open emergency repair work (HPD does the work, owner gets billed) and outstanding charges",
    "Cross-reference to ECB / OATH for any HPD violations escalated to fines",
    "AI line-item notes flagging deal-killers, escrow candidates, and tenant-litigation exposure",
    "Analyst review and attorney-ready PDF delivery",
  ],
  whoNeedsThis: [
    { title: "Multifamily buy-side investors", desc: "Habitability and lead-paint exposure quantification before acquisition close." },
    { title: "Real estate attorneys", desc: "Identify pre-existing tenant claim exposure that survives the closing." },
    { title: "Co-op and condo boards", desc: "Building-level compliance audit for board approvals on unit purchases." },
    { title: "Multifamily lenders", desc: "Independent HPD exposure check beyond standard appraisal scope." },
  ],
  faq: [
    {
      q: "What's the difference between HPD Class A, B, and C?",
      a: "Class A is non-hazardous (e.g. minor paint, minor leaks) — typically 90 days to cure. Class B is hazardous (e.g. broken locks, vermin) — 30 days to cure. Class C is immediately hazardous (e.g. no heat, lead paint exposure, no smoke detectors) — 24 hours to cure. Class C violations carry the most legal exposure and should be cured before closing.",
    },
    {
      q: "Can HPD violations from the seller's tenure affect the buyer?",
      a: "Yes. Tenants can assert warranty-of-habitability claims based on conditions that existed before transfer, and HPD emergency-repair charges follow the property, not the prior owner. This is why diligence on HPD history matters even for buildings sold with tenants in place.",
    },
    {
      q: "Do you flag lead paint exposure?",
      a: "Yes. Local Law 1 (2004) and Local Law 31 (2020) lead paint compliance is surfaced explicitly. For pre-1960 buildings with children under 6 in residence, lead paint exposure is a major liability.",
    },
    {
      q: "What about emergency repair charges?",
      a: "If HPD does emergency work because an owner didn't cure, the cost gets billed back to the property and becomes a tax lien if unpaid. We surface outstanding emergency repair charges in the executive summary.",
    },
    {
      q: "How current is HPD data?",
      a: "Pulled live at report-generation time from NYC OpenData. Public HPD data is typically current to within 24–48 hours of agency entry. We cite sources on every line item.",
    },
    {
      q: "Do you cover HPD violations on single-family homes?",
      a: "HPD primarily inspects multifamily properties (3+ units). Single-family homes generally don't have HPD violations, but they may have DOB or ECB violations — those are covered in the same BinCheckNYC report.",
    },
  ],
};

const HPDViolations = () => <AgencyLanding config={config} />;
export default HPDViolations;
