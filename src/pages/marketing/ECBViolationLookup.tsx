import AgencyLanding, { AgencyLanderConfig } from "./AgencyLandingTemplate";

const config: AgencyLanderConfig = {
  slug: "ecb-violation-lookup",
  seoTitle: "NYC ECB / OATH Violation Lookup — Open Fines & Default Judgments",
  seoDescription: "Look up NYC ECB and OATH hearing violations, open fines, and default judgments on any property. Attorney-ready PDF in 24–48 hours. $499 flat.",
  eyebrow: "ECB / OATH",
  h1: "NYC ECB Violation Lookup",
  subtitle: "ECB (Environmental Control Board) and OATH hearing records — open fines, default judgments, hearing schedules, and lien-attachable penalties across every NYC agency. AI-analyzed and signed off by our analyst team.",
  serviceName: "NYC ECB / OATH Violation Lookup Report",
  whatItIs: {
    title: "What's an ECB / OATH violation, and why is it serious?",
    paragraphs: [
      "ECB (Environmental Control Board) and OATH (Office of Administrative Trials and Hearings) handle the hearings for violations issued by DOB, DSNY, FDNY, DOT, DOHMH, and most other NYC enforcement agencies. When a violation is contested or ignored, it ends up at OATH.",
      "Default judgments — entered when an owner fails to appear at the hearing — are the dangerous outcome. Once a default judgment is entered, the fine becomes lien-attachable against the property, can be sold to a debt collector, and shows up in title searches as a cloud on title.",
      "Because ECB / OATH data is held separately from the underlying agency systems (DOB BIS doesn't show the OATH outcome, DSNY doesn't show the hearing status), most casual searches miss these. BinCheckNYC pulls both sides — the underlying violation and the OATH disposition — and flags default judgments and open balances explicitly.",
    ],
  },
  whatsIncluded: [
    "All open ECB / OATH violations by issuing agency (DOB, DSNY, FDNY, DOT, DOHMH, etc.)",
    "Default judgments entered against the property — explicitly flagged as [ACTION REQUIRED]",
    "Outstanding penalty balances with interest accrual",
    "Hearing schedule and disposition history (dismissed / sustained / settled / default)",
    "Cross-referenced to the underlying DOB / DSNY / FDNY violation so context is preserved",
    "AI line-item notes assessing cure paths and likely lien exposure",
    "Analyst signoff before delivery — every report is reviewed by a human",
    "Attorney-ready PDF for closing files and lender packets",
  ],
  whoNeedsThis: [
    { title: "Real estate attorneys", desc: "Confirm no surprise lien-attachable judgments are about to surface in title at closing." },
    { title: "Buy-side investors", desc: "Quantify total agency exposure on a property before bid; identify cure budget needs." },
    { title: "Lenders and title underwriters", desc: "Independent confirmation of OATH-side exposure beyond title-company default scope." },
    { title: "Property managers in diligence", desc: "Take-over due diligence for buildings being assumed mid-cycle." },
  ],
  faq: [
    {
      q: "What's the difference between an ECB violation and a default judgment?",
      a: "An ECB violation is the hearing-stage status — it can be dismissed, sustained, settled, or defaulted. A default judgment is what happens when the owner doesn't appear: the violation is sustained automatically and the fine becomes lien-attachable. We flag defaults as [ACTION REQUIRED] because they're the most urgent.",
    },
    {
      q: "Can ECB fines actually become liens on the property?",
      a: "Yes — once judgment is entered, the city can docket the judgment with the County Clerk, at which point it attaches as a lien. Worse, NYC sells defaulted ECB judgment debt to private debt buyers periodically, who then aggressively pursue collection.",
    },
    {
      q: "Does title search catch this?",
      a: "Sometimes. Title companies search for docketed judgments, but there's typically a 30–90 day gap between OATH default and County Clerk docketing. BinCheckNYC catches the pre-docket window where most surprises happen.",
    },
    {
      q: "How accurate is the OATH data?",
      a: "We pull from NYC OpenData and OATH's public systems. Data is typically current to within 24–72 hours. We cite our sources on every line item so your attorney can verify directly with OATH if needed.",
    },
    {
      q: "What if the violation is being contested?",
      a: "We surface the active hearing schedule and disposition history. Pending hearings get [MONITOR] flags — the outcome materially affects diligence conclusions.",
    },
    {
      q: "How fast can I get a report?",
      a: "24–48 hours standard. Same-day priority is available on the Professional plan ($2,499/mo).",
    },
  ],
};

const ECBViolationLookup = () => <AgencyLanding config={config} />;
export default ECBViolationLookup;
