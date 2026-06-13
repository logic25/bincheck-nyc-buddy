import AgencyLanding, { AgencyLanderConfig } from "./AgencyLandingTemplate";

const config: AgencyLanderConfig = {
  slug: "nyc-property-due-diligence",
  seoTitle: "NYC Property Due Diligence Reports — 8-Agency Compliance Search",
  seoDescription: "Transaction-ready NYC property due diligence reports for attorneys, investors, and deal teams. 8-agency search with AI line-item analysis and analyst QA. $499 flat, 24–48 hours.",
  eyebrow: "NYC property DD",
  h1: "NYC Property Due Diligence",
  subtitle: "Eight-agency compliance search across DOB, ECB, HPD, FDNY, DSNY, DOT, LPC, and DOF. AI-analyzed, analyst-reviewed, attorney-ready. Built for the buy side.",
  serviceName: "NYC Property Due Diligence Report",
  whatItIs: {
    title: "Why NYC property due diligence is its own discipline",
    paragraphs: [
      "Diligence on a NYC property isn't like diligence anywhere else. There are eight separate enforcement agencies (DOB, ECB, HPD, FDNY, DSNY, DOT, LPC, DOF) with their own systems, their own enforcement schedules, and their own ways of escalating to liens. A clean title search misses most of it. A standard property condition report misses all of it.",
      "Most NYC compliance vendors are built for owners monitoring buildings they already own — alerting them when something new gets issued. BinCheckNYC is built for the buy side: the attorney, investor, or fund asking 'what am I actually buying?' before they wire money.",
      "Our reports consolidate every active record across all eight agencies, cross-reference OATH hearing dispositions, surface default judgments and lien-attachable items, and produce an attorney-ready PDF with AI line-item analysis. Every report is reviewed by a human analyst before delivery — not auto-shipped.",
    ],
  },
  whatsIncluded: [
    "DOB violations, stop work orders, permit history, and Certificate of Occupancy status",
    "ECB / OATH hearings, default judgments, and outstanding penalty balances",
    "HPD violations by class (A, B, C) with cure status and lead paint flags",
    "FDNY records and fire-code enforcement history",
    "DSNY (Sanitation) violations and outstanding charges",
    "DOT (Transportation) violations — sidewalk, curb cut, vault, scaffold permits",
    "LPC (Landmarks Preservation Commission) status and open compliance items",
    "DOF (Finance) tax liens, water charges, and ECB judgments docketed to property",
    "AI line-item analysis with [ACTION REQUIRED] / [MONITOR] / [RESOLVED] flags",
    "Human analyst review and signoff before delivery",
    "Attorney-ready PDF for closing files, lender packets, and IC memos",
  ],
  whoNeedsThis: [
    { title: "Real estate attorneys", desc: "Comprehensive pre-closing diligence beyond title search scope. Surface escrow and cure items in negotiation." },
    { title: "Buy-side investors and funds", desc: "Quantify total agency exposure for IC memo and bid-price calibration on every NYC deal." },
    { title: "Title companies", desc: "Independent confirmation of agency-side exposure for high-value or complex transactions." },
    { title: "Commercial and residential brokers", desc: "Include in offer packages to surface diligence items proactively and shorten time-to-close." },
    { title: "Lenders", desc: "Pre-funding compliance check beyond appraisal and property condition report scope." },
    { title: "Family offices and HNW buyers", desc: "Independent diligence for owner-occupied and investment purchases." },
  ],
  faq: [
    {
      q: "Why eight agencies?",
      a: "Because NYC enforcement is genuinely spread across that many. DOB handles construction, HPD handles housing, FDNY handles fire, DSNY handles sanitation, DOT handles streetscape, LPC handles landmarks, ECB/OATH handles the hearings, and DOF handles the money. Skipping any of them misses real exposure.",
    },
    {
      q: "What's the difference vs. doing this myself?",
      a: "A paralegal pulling all eight agencies on a single property takes 3–6 hours. Then someone has to read it, cross-reference OATH dispositions, identify what's actionable, and write it up. BinCheckNYC delivers a finished, analyst-reviewed PDF in 24–48 hours for less than the cost of the paralegal time.",
    },
    {
      q: "Are you a substitute for an attorney's diligence?",
      a: "No. BinCheckNYC is an input to your attorney's diligence — we surface the agency-side exposure so your attorney can spend their billable hours on negotiation, structure, and closing logistics instead of cross-referencing seven public-records portals.",
    },
    {
      q: "How do you handle conflicting data across agencies?",
      a: "Common conflict: DOB shows an open violation that ECB shows as dismissed. We surface both data points, cite the source, and our analyst notes the likely truth. Final adjudication should be confirmed with the agency.",
    },
    {
      q: "Are reports white-labeled?",
      a: "Yes — Professional plan ($2,499/mo) and Enterprise tiers include white-labeled PDFs with your firm's logo and footer. Our data, our analyst signoff, your branding.",
    },
    {
      q: "What's the turnaround?",
      a: "24–48 hours standard for the One-Time Report ($499). Professional plan ($2,499/mo for 10 reports) gets priority — most reports same-day. Enterprise plans have custom SLAs.",
    },
    {
      q: "How do payments work?",
      a: "During our launch period, every report is invoiced after QA and delivery — Net 7, payable by ACH, wire, or card. You only owe if we deliver. Card-on-file checkout is coming soon.",
    },
  ],
};

const NYCPropertyDueDiligence = () => <AgencyLanding config={config} />;
export default NYCPropertyDueDiligence;
