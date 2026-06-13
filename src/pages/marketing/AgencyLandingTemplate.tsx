import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle, FileText, Shield, Building2, AlertTriangle, Clock, Download, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import SEO from "@/components/SEO";
import LeadCaptureDialog from "@/components/marketing/LeadCaptureDialog";
import { trackEvent } from "@/lib/analytics";

/**
 * Reusable template for agency-specific programmatic SEO landers.
 *
 * Pages built on this template target long-tail intent queries like
 * "DOB violation search NYC" or "HPD violation lookup". Each page gets
 * a unique title, hero copy, agency-specific FAQ, and JSON-LD, but
 * shares the same conversion flow (CTA to /order + sample-report
 * lead capture).
 */

export interface AgencyLanderConfig {
  /** URL slug, e.g. 'dob-violation-search'. Used for canonical only. */
  slug: string;
  /** <title>. Keep under 60 chars for SERPs. */
  seoTitle: string;
  /** <meta description>. Keep under 160 chars. */
  seoDescription: string;
  /** Tagline shown in the small badge above the H1. */
  eyebrow: string;
  /** Hero H1. Should match the primary keyword cluster. */
  h1: string;
  /** Hero subtitle, 1-2 sentences. */
  subtitle: string;
  /** Short agency description used in the "What is X" section. */
  whatItIs: {
    title: string;
    paragraphs: string[];
  };
  /** Bulleted list of what's covered. */
  whatsIncluded: string[];
  /** Use-cases / who needs this. */
  whoNeedsThis: { title: string; desc: string }[];
  /** Agency-specific FAQ. 4-8 items recommended. */
  faq: { q: string; a: string }[];
  /** JSON-LD service name override. */
  serviceName: string;
}

const SITE = "https://binchecknyc.com";

const AgencyLanding = ({ config }: { config: AgencyLanderConfig }) => {
  const navigate = useNavigate();
  const canonical = `${SITE}/${config.slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "name": config.serviceName,
        "provider": {
          "@type": "Organization",
          "name": "BinCheckNYC",
          "url": SITE,
        },
        "areaServed": { "@type": "City", "name": "New York" },
        "description": config.seoDescription,
        "offers": {
          "@type": "Offer",
          "price": "499.00",
          "priceCurrency": "USD",
        },
      },
      {
        "@type": "FAQPage",
        "mainEntity": config.faq.map((item) => ({
          "@type": "Question",
          "name": item.q,
          "acceptedAnswer": { "@type": "Answer", "text": item.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": SITE },
          { "@type": "ListItem", "position": 2, "name": config.h1, "item": canonical },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO
        title={config.seoTitle}
        description={config.seoDescription}
        canonical={canonical}
        jsonLd={jsonLd}
      />

      {/* Nav */}
      <header className="border-b border-border/40 sticky top-0 z-50 bg-background/90 backdrop-blur-md">
        <div className="container flex items-center justify-between h-16">
          <button onClick={() => navigate("/")} className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="font-display text-xl tracking-tight">BinCheck<span className="text-primary">NYC</span></span>
          </button>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => { trackEvent("lander_cta_clicked", { slug: config.slug, cta: "nav" }); navigate("/order"); }}>Order a Report <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="py-16 sm:py-20 px-4 border-b border-border/40">
          <div className="container max-w-4xl text-center space-y-5">
            <Badge variant="outline" className="mx-auto">{config.eyebrow}</Badge>
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.1]">
              {config.h1}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">{config.subtitle}</p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button size="lg" onClick={() => { trackEvent("lander_cta_clicked", { slug: config.slug, cta: "hero" }); navigate("/order"); }} className="font-semibold">
                Order a Report — $499 <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
              <LeadCaptureDialog intent="sample">
                <Button size="lg" variant="outline" onClick={() => trackEvent("lander_cta_clicked", { slug: config.slug, cta: "sample_hero" })}>
                  <FileText className="h-4 w-4 mr-2" /> Get a free sample
                </Button>
              </LeadCaptureDialog>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground pt-2">
              <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> 24–48 hour delivery</span>
              <span className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5" /> Analyst-reviewed</span>
              <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Invoice on delivery</span>
            </div>
          </div>
        </section>

        {/* What it is */}
        <section className="py-16 px-4">
          <div className="container max-w-3xl">
            <h2 className="font-display text-2xl md:text-3xl font-bold mb-6">{config.whatItIs.title}</h2>
            <div className="space-y-4 text-base text-muted-foreground leading-relaxed">
              {config.whatItIs.paragraphs.map((p, i) => (<p key={i}>{p}</p>))}
            </div>
          </div>
        </section>

        {/* What's included */}
        <section className="py-16 px-4 border-t border-border/40 bg-card/20">
          <div className="container max-w-3xl">
            <h2 className="font-display text-2xl md:text-3xl font-bold mb-6">What's in your report</h2>
            <ul className="space-y-3">
              {config.whatsIncluded.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm sm:text-base leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Who needs this */}
        <section className="py-16 px-4 border-t border-border/40">
          <div className="container max-w-5xl">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-10">Who orders these reports</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {config.whoNeedsThis.map((item, i) => (
                <div key={i} className="p-5 rounded-lg bg-card/50 border border-border/40 space-y-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <p className="font-semibold">{item.title}</p>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 px-4 border-t border-border/40 bg-card/20">
          <div className="container max-w-3xl">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-10">Frequently asked questions</h2>
            <Accordion type="single" collapsible className="w-full">
              {config.faq.map((item, i) => (
                <AccordionItem key={i} value={`faq-${i}`}>
                  <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline">{item.q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">{item.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 px-4 border-t border-border/40">
          <div className="container max-w-3xl text-center space-y-5">
            <AlertTriangle className="h-10 w-10 text-primary mx-auto" />
            <h2 className="font-display text-2xl md:text-3xl font-bold">Don't close blind on NYC compliance</h2>
            <p className="text-base text-muted-foreground max-w-2xl mx-auto">
              Order a full BinCheckNYC report and have it on your desk in 24–48 hours. $499 flat. Invoiced after delivery.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" onClick={() => { trackEvent("lander_cta_clicked", { slug: config.slug, cta: "footer" }); navigate("/order"); }} className="font-semibold">
                Order a Report — $499 <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
              <LeadCaptureDialog intent="sample">
                <Button size="lg" variant="outline" onClick={() => trackEvent("lander_cta_clicked", { slug: config.slug, cta: "sample_footer" })}>
                  <Download className="h-4 w-4 mr-2" /> Get a free sample first
                </Button>
              </LeadCaptureDialog>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8">
        <div className="container max-w-4xl text-center text-xs text-muted-foreground space-y-3">
          <p className="leading-relaxed max-w-3xl mx-auto">
            <span className="font-semibold text-foreground/80">Disclaimer:</span> BinCheckNYC reports are compiled from publicly available government records. Public records may be delayed, incomplete, or not yet reflected in agency databases at the time of search. All findings should be independently verified with the relevant city agencies prior to reliance in any transaction.
          </p>
          <div className="border-t border-border/30 pt-3 flex items-center justify-center gap-4 flex-wrap">
            <p>© {new Date().getFullYear()} BinCheckNYC. All rights reserved.</p>
            <span>·</span>
            <a href="/terms" className="hover:text-foreground transition-colors">Terms</a>
            <span>·</span>
            <a href="/privacy" className="hover:text-foreground transition-colors">Privacy</a>
            <span>·</span>
            <a href="mailto:hello@binchecknyc.com" className="hover:text-foreground transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AgencyLanding;
