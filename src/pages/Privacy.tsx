import { Link } from "react-router-dom";
import { Shield } from "lucide-react";

const EFFECTIVE = "June 12, 2026";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
  </section>
);

const Privacy = () => (
  <div className="min-h-screen flex flex-col bg-background">
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
        <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Effective: {EFFECTIVE}</p>
      </div>

      <Section title="1. Overview">
        <p>
          This policy explains what information BinCheckNYC ("BinCheckNYC," "we," "us") collects when you
          use binchecknyc.com, how we use it, and the choices you have. BinCheckNYC is a tool for
          compiling publicly available NYC municipal property records into research reports. We do not
          sell personal information, and we do not use your data to train third-party AI models.
        </p>
      </Section>

      <Section title="2. Information We Collect">
        <p><strong>Information you provide:</strong></p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Account details — name, email address, password (stored hashed by our authentication
            provider).</li>
          <li>Report inputs — property address, "Prepared For" name, transaction notes you choose to
            include, and any optional context you write in the analyst-notes field.</li>
          <li>Payment details — handled directly by Stripe; BinCheckNYC never sees full card numbers and
            does not store them.</li>
          <li>Support correspondence — emails you send us and replies we send back.</li>
        </ul>
        <p><strong>Information collected automatically:</strong></p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Usage telemetry — pages viewed, actions taken in the app, report IDs generated, error logs.
            Used to operate and improve the service.</li>
          <li>Device & connection — IP address, browser type, device type, referring URL. Used for
            security, fraud prevention, and rate limiting.</li>
          <li>Cookies & local storage — session tokens that keep you logged in, and minimal preference
            storage. We do not use third-party advertising cookies.</li>
        </ul>
        <p><strong>Information about properties:</strong></p>
        <p>
          The property records that appear in reports are sourced from public NYC agency data and are not
          "personal information" about you — they are records the city itself publishes about parcels,
          buildings, and recorded documents.
        </p>
      </Section>

      <Section title="3. How We Use Information">
        <ul className="list-disc pl-6 space-y-1">
          <li>To deliver reports, run the application, and provide customer support;</li>
          <li>To process payments and prevent fraudulent transactions;</li>
          <li>To send transactional email (report-ready notifications, receipts, account alerts,
            unsubscribe confirmations);</li>
          <li>To improve report accuracy and AI commentary quality (using aggregated, de-identified
            usage signals);</li>
          <li>To comply with legal obligations and to enforce our Terms of Service.</li>
        </ul>
      </Section>

      <Section title="4. AI Processing">
        <p>
          BinCheckNYC uses third-party large-language-model providers to generate narrative notes and
          risk summaries inside reports. The data we send to these providers consists of the public
          municipal records BinCheckNYC has retrieved plus the property address and any analyst-notes
          context you provided. We do not send your password, payment information, or other account
          credentials to AI providers, and our agreements with those providers prohibit them from using
          BinCheckNYC traffic to train their public models.
        </p>
      </Section>

      <Section title="5. Sharing">
        <p>We share information only with:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Service providers</strong> who operate the platform under contract — including our
            hosting provider, database provider (Supabase), payment processor (Stripe), email delivery
            provider (Resend), and AI providers. These vendors process data only on our instructions.</li>
          <li><strong>The "Prepared For" recipient and the client email</strong> you specify when ordering
            a report, who will receive a link to the completed report.</li>
          <li><strong>Law enforcement or regulators</strong>, where required by valid legal process or to
            protect the rights, safety, or property of BinCheckNYC, our users, or the public.</li>
        </ul>
        <p>We do not sell personal information and we do not share it for cross-context behavioral
          advertising.</p>
      </Section>

      <Section title="6. Retention">
        <p>
          Account and report data is retained for as long as your account is active and for a reasonable
          period afterward to support refunds, dispute resolution, audit, and legal compliance. Telemetry
          and security logs are retained for up to 24 months unless a longer period is required by law.
          You may request deletion of your account and associated reports by emailing us at the address
          below; once deleted, reports cannot be recovered.
        </p>
      </Section>

      <Section title="7. Security">
        <p>
          BinCheckNYC uses encryption in transit (HTTPS/TLS), encryption at rest for our database,
          role-based access controls, and authentication via short-lived JWT tokens. Sensitive
          administrative endpoints require both a valid session and an explicit admin role. No system is
          perfectly secure; if you believe your account has been compromised, contact us immediately.
        </p>
      </Section>

      <Section title="8. Your Choices">
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Access & correction.</strong> View and update your account details in Settings.</li>
          <li><strong>Email preferences.</strong> Every BinCheckNYC marketing email includes an
            unsubscribe link. Transactional emails (receipts, report-ready notifications, password
            resets) cannot be unsubscribed without closing your account.</li>
          <li><strong>Deletion.</strong> Email{" "}
            <a href="mailto:hello@binchecknyc.com" className="text-primary hover:underline">
              hello@binchecknyc.com
            </a>{" "}
            to request account and report deletion.</li>
          <li><strong>State-specific rights.</strong> Residents of California, Virginia, Colorado,
            Connecticut, and other states with comprehensive privacy laws may have additional rights
            (access, correction, deletion, portability, opt-out of sale/sharing). BinCheckNYC does not
            sell personal information; to exercise other rights, contact us at the address above.</li>
        </ul>
      </Section>

      <Section title="9. Children">
        <p>
          BinCheckNYC is intended for use by adults in the context of real-estate due diligence. We do
          not knowingly collect personal information from anyone under 18. If you believe a minor has
          provided us with personal information, contact us and we will delete it.
        </p>
      </Section>

      <Section title="10. International Users">
        <p>
          BinCheckNYC is operated from the United States and the data we process is stored in the
          United States. If you access BinCheckNYC from outside the U.S., you understand that your
          information will be transferred to and processed in the U.S.
        </p>
      </Section>

      <Section title="11. Changes">
        <p>
          We may update this policy from time to time. Material changes will be posted here with a new
          effective date. Continued use of BinCheckNYC after a change constitutes acceptance of the
          updated policy.
        </p>
      </Section>

      <Section title="12. Contact">
        <p>
          Questions or requests? Email{" "}
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
        <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>{" "}
        ·{" "}
        <a href="mailto:hello@binchecknyc.com" className="hover:text-foreground transition-colors">Contact</a>
      </div>
    </footer>
  </div>
);

export default Privacy;
