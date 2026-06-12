import { Link } from "react-router-dom";
import { Shield } from "lucide-react";

const EFFECTIVE = "June 12, 2026";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
  </section>
);

const Terms = () => (
  <div className="min-h-screen flex flex-col bg-background">
    {/* Header */}
    <header className="border-b border-border/40 sticky top-0 bg-background/80 backdrop-blur z-10">
      <div className="container max-w-4xl flex items-center justify-between h-14">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <Shield className="h-5 w-5 text-primary" />
          <span>BinCheck<span className="text-primary">NYC</span></span>
        </Link>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back to home
        </Link>
      </div>
    </header>

    <main className="flex-1 container max-w-3xl py-12 space-y-10">
      <div className="space-y-2">
        <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Effective: {EFFECTIVE}</p>
      </div>

      <Section title="1. What BinCheckNYC Is">
        <p>
          BinCheckNYC ("BinCheckNYC," "we," "us") is a research tool that compiles publicly available
          New York City municipal records — including Department of Buildings (DOB) records, Environmental
          Control Board (ECB) judgments, Housing Preservation & Development (HPD) violations, Fire Department
          (FDNY) violations, Department of Transportation (DOT) sidewalk records, Landmarks Preservation
          Commission (LPC) records, Department of Environmental Protection (DEP) records, ACRIS recorded
          documents, and DOB-NOW filings — and presents them in a single property report.
        </p>
        <p>
          BinCheckNYC reports are informational research products. They are <strong>not</strong> title insurance,
          a title search, a legal opinion, an architectural or engineering certification, a Certificate of
          Correction, or a substitute for the independent due diligence customarily performed by attorneys,
          architects, engineers, title agents, or expediters licensed to practice in New York.
        </p>
      </Section>

      <Section title="2. Eligibility & Accounts">
        <p>
          You must be at least 18 years old and capable of forming a binding contract to use BinCheckNYC.
          You agree to provide accurate registration information and to keep your account credentials
          confidential. You are responsible for all activity under your account.
        </p>
        <p>
          Reports are licensed to the individual or entity identified in the "Prepared For" field at
          checkout. Sharing a report internally with co-counsel, clients, or transaction parties is
          permitted; reselling reports or systematically republishing their contents is not.
        </p>
      </Section>

      <Section title="3. Source Data, Delays & Accuracy">
        <p>
          BinCheckNYC retrieves data from NYC Open Data, the DOB BIS and DOB-NOW public portals, ACRIS,
          and other publicly accessible municipal sources. These sources may be incomplete, delayed,
          contain errors, or fail to reflect very recent filings. We do not guarantee that any report
          captures every record on file, and a report should be treated as a snapshot of public data
          available at the time of generation.
        </p>
        <p>
          <strong>Independent verification.</strong> Before relying on a BinCheckNYC report in connection
          with any real-estate transaction, closing, lien clearance, permit decision, or financial
          commitment, you agree to independently verify the underlying records with the relevant city
          agency. BinCheckNYC is a starting point for due diligence, not its conclusion.
        </p>
      </Section>

      <Section title="4. AI-Generated Analysis">
        <p>
          BinCheckNYC reports include AI-generated narrative notes, summaries, and risk-score commentary
          alongside the underlying public records. AI output may contain errors, may misclassify
          violations, and may not reflect the most current legal or regulatory standard. AI commentary is
          provided for orientation and should be evaluated by a qualified professional before being relied
          upon for any transaction.
        </p>
      </Section>

      <Section title="5. Payment, Refunds & Cancellations">
        <p>
          One-time report fees are charged at checkout via Stripe. Subscription plans renew monthly until
          canceled from your account settings; canceling stops future renewals but does not refund the
          current billing period.
        </p>
        <p>
          If a report fails to generate due to a BinCheckNYC system error, we will either reissue the
          report at no charge or refund the report fee. Refunds for completed reports are evaluated on a
          case-by-case basis when the report contains a material defect attributable to BinCheckNYC (not
          to gaps or errors in the underlying public data).
        </p>
      </Section>

      <Section title="6. Acceptable Use">
        <p>You agree not to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Use BinCheckNYC to harass, defame, or harm any individual or entity;</li>
          <li>Resell reports as your own product or remove BinCheckNYC attribution from delivered PDFs;</li>
          <li>Reverse-engineer the platform, probe for vulnerabilities, or attempt to access accounts or
            data that are not yours;</li>
          <li>Submit automated requests at a rate that interferes with service availability;</li>
          <li>Use BinCheckNYC for any unlawful purpose or in violation of NYC, New York State, or U.S.
            federal law.</li>
        </ul>
      </Section>

      <Section title="7. Disclaimer of Warranties">
        <p>
          BinCheckNYC is provided "as is" and "as available," without warranties of any kind, express or
          implied, including warranties of merchantability, fitness for a particular purpose, accuracy,
          completeness, or non-infringement. We do not warrant that reports are error-free, that the
          service will be uninterrupted, or that defects will be corrected within any specific timeframe.
        </p>
      </Section>

      <Section title="8. Limitation of Liability">
        <p>
          To the maximum extent permitted by law, BinCheckNYC's total cumulative liability arising out of
          or related to your use of the service is limited to the amount you paid BinCheckNYC in the
          twelve (12) months preceding the event giving rise to the claim. BinCheckNYC is not liable for
          indirect, incidental, consequential, special, or punitive damages, or for lost profits, lost
          opportunities, or transaction failures, even if advised of the possibility of such damages.
        </p>
      </Section>

      <Section title="9. Indemnification">
        <p>
          You agree to defend, indemnify, and hold harmless BinCheckNYC and its officers, employees, and
          contractors from any claim arising out of your use of a BinCheckNYC report in a transaction,
          including any claim that you relied on a report without independent verification of the
          underlying public records.
        </p>
      </Section>

      <Section title="10. Changes to These Terms">
        <p>
          We may update these Terms from time to time. Material changes will be posted on this page with a
          new effective date. Continued use of BinCheckNYC after a change constitutes acceptance of the
          updated Terms.
        </p>
      </Section>

      <Section title="11. Governing Law">
        <p>
          These Terms are governed by the laws of the State of New York, without regard to conflict-of-laws
          principles. Any dispute will be brought exclusively in the state or federal courts located in
          New York County, New York, and you consent to personal jurisdiction in those courts.
        </p>
      </Section>

      <Section title="12. Contact">
        <p>
          Questions about these Terms? Email{" "}
          <a href="mailto:hello@binchecknyc.com" className="text-primary hover:underline">
            hello@binchecknyc.com
          </a>
          .
        </p>
      </Section>
    </main>

    <footer className="border-t border-border/40 py-6">
      <div className="container max-w-4xl text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} BinCheckNYC. ·{" "}
        <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>{" "}
        ·{" "}
        <a href="mailto:hello@binchecknyc.com" className="hover:text-foreground transition-colors">Contact</a>
      </div>
    </footer>
  </div>
);

export default Terms;
