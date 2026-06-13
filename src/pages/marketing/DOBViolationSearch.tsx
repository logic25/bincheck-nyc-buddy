import AgencyLanding, { AgencyLanderConfig } from "./AgencyLandingTemplate";

const config: AgencyLanderConfig = {
  slug: "dob-violation-search",
  seoTitle: "NYC DOB Violation Search — Open Violations & Stop Work Orders",
  seoDescription: "Search NYC Department of Buildings violations, stop work orders, and permit history on any address. Attorney-ready PDF in 24–48 hours. $499 flat.",
  eyebrow: "DOB violations",
  h1: "NYC DOB Violation Search",
  subtitle: "Open Department of Buildings violations, stop work orders, partial stop work, vacate orders, and permit history — pulled directly from DOB BIS and DOB NOW. Delivered as an attorney-ready PDF with AI line-item analysis.",
  serviceName: "NYC DOB Violation Search Report",
  whatItIs: {
    title: "What's a DOB violation, and why does it matter at closing?",
    paragraphs: [
      "The NYC Department of Buildings (DOB) issues violations for everything from work-without-permit to structural defects. Open DOB violations can prevent recording of deeds, block financing, trigger lender holdbacks, and in extreme cases result in stop work orders or vacate orders that prevent occupancy entirely.",
      "DOB data is spread across two legacy systems — BIS (Building Information System) and DOB NOW. Both have search interfaces that are clunky, sometimes incomplete, and don't surface the actual penalty status or cure path. Pulling a clean compliance picture on a single property typically takes a paralegal 1–3 hours of cross-referencing.",
      "BinCheckNYC consolidates every active DOB record on a property — violations, ECB hearings, open permits, partial filings, certificates of occupancy issues — into one PDF with line-item AI analysis flagging which items are deal-killers, which need escrow, and which are merely informational.",
    ],
  },
  whatsIncluded: [
    "All open DOB violations with class (1/2/3), issuance date, status, and penalty balance",
    "Stop work orders, partial stop work, and vacate orders — the items most likely to block a closing",
    "Open and in-progress permit applications (BIS and DOB NOW), including pending work",
    "Certificate of Occupancy status, including TCOs and pending updates",
    "ECB / OATH hearings tied to DOB violations, with default judgment status",
    "AI line-item notes prefixed [ACTION REQUIRED], [MONITOR], or [RESOLVED]",
    "Human analyst review and signoff on every report before delivery",
    "Attorney-ready PDF suitable for closing files, lender packets, and IC memos",
  ],
  whoNeedsThis: [
    { title: "Real estate attorneys", desc: "Confirm clean DOB status before recording deeds; surface escrow items in negotiation." },
    { title: "Buy-side investors", desc: "Pre-acquisition diligence on small multifamily, mixed-use, and condo deals across all five boroughs." },
    { title: "Title companies", desc: "Independent confirmation of agency exposure beyond standard title search scope." },
    { title: "Commercial brokers", desc: "Include in offer packages to surface diligence items proactively and shorten time-to-close." },
  ],
  faq: [
    {
      q: "How is BinCheckNYC different from the free DOB BIS search?",
      a: "DOB BIS lets you look up records, but it doesn't tell you which items are actionable, doesn't combine with ECB/OATH hearings, and doesn't produce a closing-grade PDF. BinCheckNYC reports include AI analyst notes on every line item, cross-reference ECB hearings and default judgments, and arrive as a signed-off PDF ready for the closing file.",
    },
    {
      q: "Do you cover DOB NOW filings too?",
      a: "Yes. We pull from both legacy BIS and the newer DOB NOW system, so pending and in-progress permit work shows up regardless of which system the filing lives in.",
    },
    {
      q: "How fresh is the data?",
      a: "We pull live at report-generation time from publicly available NYC sources. Public data can be delayed at the agency level (typically 24–72 hours) — we flag this explicitly on every report and cite our sources line-by-line so your attorney can verify directly with DOB if needed.",
    },
    {
      q: "What if there's an open stop work order?",
      a: "We surface it as [ACTION REQUIRED] in the executive summary. Stop work orders need to be cured (or have a clear path to cure) before most closings can proceed, and lenders typically require resolution before funding.",
    },
    {
      q: "Do you handle searches by BIN, BBL, or address?",
      a: "All three. Enter a BIN, a BBL (borough-block-lot), or a NYC street address and we'll resolve to the correct building record.",
    },
    {
      q: "Turnaround?",
      a: "24–48 hours standard. Professional plan ($2,499/mo) gets priority — most reports same-day.",
    },
  ],
};

const DOBViolationSearch = () => <AgencyLanding config={config} />;
export default DOBViolationSearch;
