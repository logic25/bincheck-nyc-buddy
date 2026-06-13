import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Building2, Shield, FileText, ArrowRight, AlertTriangle, MapPin, LogOut, Settings, CheckCircle, Clock, Download, Zap, Star, X, Eye, Brain, ClipboardCheck, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import SEO from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";

interface GeoSuggestion {
  label: string;
  borough: string;
}

/**
 * Comparison-table row used in the "Built for the buy side" section.
 * Accepts either a boolean (renders check/X icons) or a string label.
 */
type CompareCellValue = boolean | string;

function CompareCell({ value, highlight = false }: { value: CompareCellValue; highlight?: boolean }) {
  if (value === true) {
    return <CheckCircle className={`h-4 w-4 mx-auto ${highlight ? "text-primary" : "text-emerald-600"}`} />;
  }
  if (value === false) {
    return <X className="h-4 w-4 mx-auto text-muted-foreground/60" />;
  }
  return <span className={`text-xs ${highlight ? "font-semibold" : "text-muted-foreground"}`}>{value}</span>;
}

function CompareRow({ row, us, them, last }: { row: string; us: CompareCellValue; them: CompareCellValue; last: boolean }) {
  const border = last ? "" : "border-b";
  return (
    <>
      <div className={`p-4 ${border} border-r border-border text-sm font-medium`}>{row}</div>
      <div className={`p-4 ${border} border-r border-border bg-primary/5 text-center`}>
        <CompareCell value={us} highlight />
      </div>
      <div className={`p-4 ${border} border-border text-center`}>
        <CompareCell value={them} />
      </div>
    </>
  );
}

const Index = () => {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [session, setSession] = useState<any>(null);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLFormElement>(null);
  const { isAdmin } = useUserRole();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) navigate('/dashboard');
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) navigate('/dashboard');
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchSuggestions = useCallback(async (text: string) => {
    if (text.length < 3 || /^\d+$/.test(text.trim())) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(
        `https://geosearch.planninglabs.nyc/v2/autocomplete?text=${encodeURIComponent(text)}&size=6`
      );
      if (!res.ok) { await res.text(); return; }
      const data = await res.json();
      const results: GeoSuggestion[] = (data.features || []).map((f: any) => ({
        label: f.properties?.label || f.properties?.name || "",
        borough: f.properties?.borough || "",
      }));
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setHighlightedIndex(-1);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 200);
  };

  const selectSuggestion = (label: string) => {
    setQuery(label);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setShowSuggestions(false);
    const isNumeric = /^\d+$/.test(query.trim());
    navigate(`/report?${isNumeric ? "bin" : "address"}=${encodeURIComponent(query.trim())}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex(i => (i < suggestions.length - 1 ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(i => (i > 0 ? i - 1 : suggestions.length - 1));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[highlightedIndex].label);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO
        title="BinCheckNYC — NYC property due diligence for closing teams"
        description="Transaction-ready NYC property compliance reports. 8-agency violation search (DOB, ECB, HPD, FDNY, DSNY, DOT, LPC, DOF) with AI line-item notes and human analyst QA. 24–48 hour delivery. $499 flat."
        path="/"
      />
      {/* Nav */}
      <header className="border-b border-border/40 sticky top-0 z-50 bg-background/90 backdrop-blur-md">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="font-display text-xl tracking-tight">BinCheck<span className="text-primary">NYC</span></span>
          </div>
          <nav className="flex items-center gap-2">
            {session ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>Home</Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
                  <Settings className="h-4 w-4 mr-1" /> Settings
                </Button>
                <Button variant="ghost" size="sm" onClick={async () => { await supabase.auth.signOut(); setSession(null); }}>
                  <LogOut className="h-4 w-4 mr-1" /> Sign Out
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate("/auth")} className="text-muted-foreground hover:text-foreground">
                  Log In
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/order")} className="text-muted-foreground hover:text-foreground">
                  Pricing
                </Button>
                <Button size="sm" onClick={() => navigate("/order")}>
                  Order a Report <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="flex items-center justify-center px-4 pt-20 pb-16">
          <div className="max-w-3xl w-full text-center space-y-10">
            {session ? (
              <div className="space-y-3">
                <h1 className="font-display text-3xl font-bold tracking-tight">Property Search</h1>
                <p className="text-muted-foreground">Look up any NYC property by BIN number or address</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/60 bg-card text-xs text-muted-foreground font-medium mb-2">
                  <Star className="h-3 w-3 text-primary" /> Trusted by NYC real estate attorneys & investors
                </div>
                <h1 className="font-display text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.1]">
                  Due diligence,{" "}
                  <span className="text-primary">delivered.</span>
                </h1>
                <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
                  Transaction-ready NYC property compliance reports for attorneys, investors, and deal teams. Open violations, stop work orders, and comprehensive analysis across city agencies.
                </p>
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <Button size="lg" onClick={() => navigate("/order")} className="font-semibold">
                    Order a Report — $499 <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => navigate("/auth")}>
                    Sign In
                  </Button>
                </div>
              </div>
            )}

            {/* Search */}
            <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto" ref={wrapperRef}>
              <div className="relative flex items-center bg-card border border-border rounded-lg overflow-visible shadow-sm">
                <Search className="h-5 w-5 text-muted-foreground ml-4 shrink-0" />
                <Input
                  value={query}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  onKeyDown={handleKeyDown}
                  placeholder="Quick search: enter BIN number or NYC address..."
                  className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base h-14 pl-3"
                  autoComplete="off"
                />
                <Button type="submit" size="lg" className="m-1.5 shrink-0 font-semibold">
                  Search <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${i === highlightedIndex ? "bg-muted" : "hover:bg-muted/50"}`}
                      onClick={() => selectSuggestion(s.label)}
                      onMouseEnter={() => setHighlightedIndex(i)}
                    >
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate text-foreground">{s.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </form>

            {!session && (
              <p className="text-xs text-muted-foreground">
                Free quick search. <span className="text-primary cursor-pointer hover:underline" onClick={() => navigate("/order")}>Order a full DD report →</span>
              </p>
            )}
          </div>
        </section>

        {!session && (
          <>
            {/* What's Included */}
            <section className="border-t border-border/40 py-16 px-4">
              <div className="container max-w-5xl">
                <h2 className="font-display text-2xl font-bold text-center mb-10">
                  Everything your transaction team needs
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { icon: Building2, title: "DOB & ECB Violations", desc: "Open Department of Buildings and Environmental Control Board violations with penalty balances and hearing status" },
                    { icon: AlertTriangle, title: "Stop Work & Vacate Orders", desc: "Stop work orders, partial stop work, and vacate orders that can block title closing or financing" },
                    { icon: Shield, title: "HPD Violations", desc: "Housing Preservation & Development violations by class — A, B, and C (immediately hazardous)" },
                    { icon: FileText, title: "Permit Activity", desc: "BIS and DOB NOW permit applications — partial, pending, and in-progress filings flagged for attorney review" },
                    { icon: Zap, title: "FDNY, DSNY, DOT, LPC, DOF", desc: "OATH hearing records for all city agencies — open fines, default judgments, and enforcement actions" },
                    { icon: CheckCircle, title: "AI Risk Analysis", desc: "Gemini-powered attorney notes on every line item — prefixed [ACTION REQUIRED], [MONITOR], or [RESOLVED]" },
                  ].map((f) => (
                    <div key={f.title} className="p-6 rounded-lg bg-card/50 text-left space-y-3 hover:bg-card transition-colors border border-border/40">
                      <f.icon className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold text-sm">{f.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* How It Works */}
            <section className="border-t border-border/40 py-16 px-4 bg-card/20">
              <div className="container max-w-4xl">
                <h2 className="font-display text-2xl font-bold text-center mb-10">How it works</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
                  {[
                    { step: "01", icon: MapPin, title: "Submit Your Property", desc: "Enter the NYC address and tell us what you need — buying a unit, closing a deal, a specific concern." },
                    { step: "02", icon: Clock, title: "We Prepare Your Report", desc: "Our team runs 8-agency searches, AI flags every item, and our analysts review before delivery." },
                    { step: "03", icon: Download, title: "Download & Close", desc: "Receive your attorney-ready PDF with line-item notes, risk ratings, and a signed-off summary." },
                  ].map((s) => (
                    <div key={s.step} className="text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                        <s.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="text-xs font-mono text-primary font-semibold">{s.step}</div>
                      <h3 className="font-semibold">{s.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* What's actually in the report */}
            <section className="border-t border-border/40 py-16 px-4">
              <div className="container max-w-5xl">
                <div className="text-center mb-10">
                  <Badge variant="outline" className="mb-3">The deliverable</Badge>
                  <h2 className="font-display text-2xl md:text-3xl font-bold">What's actually in your report</h2>
                  <p className="text-muted-foreground text-sm mt-2 max-w-2xl mx-auto">
                    Every BinCheckNYC report is an attorney-ready PDF with line-item analyst notes — not a CSV dump or a raw violation list.
                  </p>
                </div>

                {/* Sample report mockup card */}
                <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                  <div className="border-b border-border bg-muted/40 px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">Sample: 123 W 42nd St — Manhattan, NY</span>
                    </div>
                    <Badge variant="outline" className="text-xs">Sample preview</Badge>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Risk Score</p>
                      <p className="font-display text-4xl font-extrabold text-amber-600">62<span className="text-base font-normal text-muted-foreground">/100</span></p>
                      <p className="text-xs text-muted-foreground">Moderate — active items require action before closing</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Open Items</p>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex items-center justify-between"><span>DOB violations</span><span className="font-semibold">4</span></div>
                        <div className="flex items-center justify-between"><span>ECB / OATH fines</span><span className="font-semibold">2</span></div>
                        <div className="flex items-center justify-between"><span>HPD violations</span><span className="font-semibold">1</span></div>
                        <div className="flex items-center justify-between"><span>Open permits</span><span className="font-semibold">3</span></div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Outstanding Penalties</p>
                      <p className="font-display text-3xl font-extrabold">$14,250</p>
                      <p className="text-xs text-muted-foreground">Plus 2 default judgments under review</p>
                    </div>
                  </div>
                  <div className="border-t border-border bg-muted/20 px-6 py-5 space-y-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Sample analyst note</p>
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
                      <div className="flex items-start gap-2">
                        <span className="inline-flex items-center text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded shrink-0 mt-0.5">[ACTION REQUIRED]</span>
                      </div>
                      <p className="text-sm mt-2 leading-relaxed">
                        ECB violation #34958721 (Class 1, hazardous) issued 2024-09-14 for unpermitted facade work. Default judgment entered — lien attachable. <span className="font-semibold">Recommend curing before title transfer or escrowing $8,500 + interest.</span>
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-border px-6 py-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><ClipboardCheck className="h-3.5 w-3.5" /> Signed off by our analyst team before delivery</span>
                    <span>Sample data — not a real property</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
                  {[
                    { icon: Building2, title: "8 city agencies", desc: "DOB, ECB, HPD, FDNY, DSNY, DOT, LPC, DOF — every record we can legally pull" },
                    { icon: Brain, title: "AI line-item analysis", desc: "Gemini-powered notes prefixed [ACTION REQUIRED], [MONITOR], or [RESOLVED]" },
                    { icon: Eye, title: "Analyst QA", desc: "Every report reviewed by a human before delivery — not auto-shipped" },
                    { icon: Download, title: "Attorney-ready PDF", desc: "Branded, formatted, citation-ready for closing files and lender packets" },
                  ].map((f) => (
                    <div key={f.title} className="p-5 rounded-lg bg-card/50 border border-border/40 space-y-2">
                      <f.icon className="h-4 w-4 text-primary" />
                      <p className="font-semibold text-sm">{f.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Comparison: BinCheck vs other DD providers */}
            <section className="border-t border-border/40 py-16 px-4 bg-card/20">
              <div className="container max-w-5xl">
                <div className="text-center mb-10">
                  <Badge variant="outline" className="mb-3">Why BinCheckNYC</Badge>
                  <h2 className="font-display text-2xl md:text-3xl font-bold">Built for the buy side</h2>
                  <p className="text-muted-foreground text-sm mt-2 max-w-2xl mx-auto">
                    Most NYC compliance reports are built for owners monitoring buildings they already own. BinCheckNYC is built for the deal team asking <span className="italic">"what am I actually buying?"</span>
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="grid grid-cols-3 text-sm">
                    {/* Header row */}
                    <div className="p-4 border-b border-r border-border bg-muted/40"></div>
                    <div className="p-4 border-b border-r border-border bg-primary/5 text-center">
                      <p className="font-display font-bold text-base">BinCheck<span className="text-primary">NYC</span></p>
                      <p className="text-xs text-muted-foreground mt-1">Buy-side DD</p>
                    </div>
                    <div className="p-4 border-b border-border bg-muted/40 text-center">
                      <p className="font-semibold text-base text-muted-foreground">Other providers</p>
                      <p className="text-xs text-muted-foreground mt-1">Legacy DD vendors</p>
                    </div>

                    {[
                      { row: "Primary use case", us: "Closing-day decisions", them: "Ongoing portfolio monitoring" },
                      { row: "Turnaround", us: "24–48 hours", them: "3–10 business days" },
                      { row: "Per-report price", us: "$499 flat", them: "$800–$1,500+" },
                      { row: "AI analyst notes", us: true, them: false },
                      { row: "Human QA before delivery", us: true, them: "Sometimes" },
                      { row: "Action-priority flags", us: "[ACTION REQUIRED] / [MONITOR] / [RESOLVED]", them: "Raw record dump" },
                      { row: "Attorney-ready PDF format", us: true, them: "CSV / portal export" },
                      { row: "Subscription required", us: false, them: "Often" },
                    ].map((r, i, arr) => (
                      <CompareRow key={r.row} row={r.row} us={r.us} them={r.them} last={i === arr.length - 1} />
                    ))}
                  </div>
                </div>

                <div className="text-center mt-8">
                  <Button size="lg" onClick={() => navigate("/order")} className="font-semibold">
                    Order a Report — $499 <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </section>

            {/* FAQ */}
            <section className="border-t border-border/40 py-16 px-4">
              <div className="container max-w-3xl">
                <div className="text-center mb-10">
                  <Badge variant="outline" className="mb-3">FAQ</Badge>
                  <h2 className="font-display text-2xl md:text-3xl font-bold">Questions deal teams ask us</h2>
                </div>
                <Accordion type="single" collapsible className="w-full">
                  {[
                    {
                      q: "Who is this for?",
                      a: "Real estate attorneys closing NYC transactions, buy-side investors and family offices conducting pre-acquisition diligence, commercial brokers preparing offer packages, and title companies confirming agency exposure. If you're asking 'what am I buying?', this report is for you.",
                    },
                    {
                      q: "How is this different from running my own ACRIS / BIS / ECB searches?",
                      a: "Manually pulling 8 agency portals on a single property takes a paralegal 3–6 hours. Then someone still has to read the results, flag which items are actionable, and assemble a clean closing-file PDF. BinCheckNYC delivers that final product in 24–48 hours for less than the cost of the paralegal time — with AI line-item analysis and human QA on top.",
                    },
                    {
                      q: "What's actually included in the 8-agency search?",
                      a: "DOB (Department of Buildings) violations and permits, ECB / OATH hearings, HPD (Housing Preservation & Development) violations by class, FDNY records, DSNY (Sanitation), DOT (Transportation), LPC (Landmarks Preservation), and DOF (Finance — tax liens and water charges). Plus AI-powered analyst notes on every line item.",
                    },
                    {
                      q: "How accurate is the data?",
                      a: "We pull from publicly available NYC government sources. Public records can be delayed or incomplete at the agency level — we cite our sources on every line item so your attorney can verify directly. Every report is reviewed by a human analyst before delivery, and we flag known data-freshness issues explicitly.",
                    },
                    {
                      q: "What if the report finds something that kills the deal?",
                      a: "That's the point. Better to find a $40K open ECB judgment in pre-closing diligence than after wire. Our [ACTION REQUIRED] flags are designed to surface deal-killers early so you can negotiate, escrow, or walk.",
                    },
                    {
                      q: "How do payments work?",
                      a: "During our launch period, every order is invoiced after the report is QA'd and delivered — Net 7, payable by ACH, wire, or card. You only owe us if we deliver. Card-on-file checkout is coming soon.",
                    },
                    {
                      q: "Can you do rush turnarounds?",
                      a: "Standard turnaround is 24–48 hours. Professional plan ($2,499/mo) gets priority queue placement — most reports same-day. For enterprise SLAs, contact us directly at hello@binchecknyc.com.",
                    },
                    {
                      q: "Do you white-label for law firms?",
                      a: "Yes — included on the Professional plan. Your firm's logo and footer; our data and analyst signoff. Enterprise plans support fully custom report templates.",
                    },
                  ].map((item, i) => (
                    <AccordionItem key={i} value={`faq-${i}`}>
                      <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline">{item.q}</AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground leading-relaxed">{item.a}</AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>

                <div className="text-center mt-10">
                  <p className="text-sm text-muted-foreground mb-3">Still have questions?</p>
                  <Button variant="outline" size="sm" onClick={() => window.location.href = "mailto:hello@binchecknyc.com"}>
                    <Mail className="h-4 w-4 mr-2" /> hello@binchecknyc.com
                  </Button>
                </div>
              </div>
            </section>

            {/* Pricing */}
            <section className="border-t border-border/40 py-16 px-4">
              <div className="container max-w-4xl">
                <h2 className="font-display text-2xl font-bold text-center mb-3">Simple, transparent pricing</h2>
                <p className="text-muted-foreground text-center mb-10 text-sm">Cheaper than 30 minutes of paralegal time. Faster than any manual search.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* One-Time */}
                  <div className="p-6 rounded-lg border border-border bg-card space-y-5">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">One-Time Report</p>
                      <p className="font-display text-4xl font-extrabold mt-1">$499</p>
                      <p className="text-xs text-muted-foreground mt-1">Flat price · no rush fee</p>
                    </div>
                    <ul className="space-y-2 text-sm">
                      {["8-agency violation search", "AI line-item notes", "Attorney-ready PDF", "24–48 hr delivery", "One-time purchase, no subscription"].map(f => (
                        <li key={f} className="flex items-center gap-2">
                          <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="text-muted-foreground">{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button className="w-full" onClick={() => navigate("/order")}>Order a Report</Button>
                  </div>

                  {/* Professional */}
                  <div className="p-6 rounded-lg border-2 border-primary bg-card space-y-5 relative">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">Most Popular</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Professional</p>
                      <p className="font-display text-4xl font-extrabold mt-1">$2,499<span className="text-lg font-normal text-muted-foreground">/mo</span></p>
                      <p className="text-xs text-muted-foreground mt-1">10 reports · $249/report effective</p>
                    </div>
                    <ul className="space-y-2 text-sm">
                      {["8-agency violation search", "AI line-item notes", "Attorney-ready PDF", "Priority processing queue", "Same-day delivery on most reports", "White-label PDF option", "Rollover unused reports", "Dedicated support"].map(f => (
                        <li key={f} className="flex items-center gap-2">
                          <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="text-muted-foreground">{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button className="w-full" onClick={() => navigate("/order?plan=professional")}>Get Started</Button>
                  </div>

                  {/* Enterprise */}
                  <div className="p-6 rounded-lg border border-border bg-card space-y-5">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Enterprise</p>
                      <p className="font-display text-4xl font-extrabold mt-1">Custom</p>
                      <p className="text-xs text-muted-foreground mt-1">For law firms & title companies</p>
                    </div>
                    <ul className="space-y-2 text-sm">
                      {["Unlimited reports", "Dedicated account manager", "Custom invoice & billing", "API access (coming soon)", "SLA guarantees"].map(f => (
                        <li key={f} className="flex items-center gap-2">
                          <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="text-muted-foreground">{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button variant="outline" className="w-full" onClick={() => window.location.href = "mailto:hello@binchecknyc.com"}>Contact Us</Button>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-6 mt-8 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Invoice on delivery — Net 7</span>
                  <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> SSL encrypted</span>
                  <span className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5" /> You only pay if we deliver</span>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8">
        <div className="container max-w-4xl text-center text-xs text-muted-foreground space-y-3">
          <p className="leading-relaxed max-w-3xl mx-auto">
            <span className="font-semibold text-foreground/80">Disclaimer:</span> BinCheckNYC reports are compiled from publicly available government records. Public records may be delayed, incomplete, or not yet reflected in agency databases at the time of search. All findings should be independently verified with the relevant city agencies prior to reliance in any transaction. BinCheckNYC, its officers, employees, and affiliates assume no liability for errors or omissions in underlying government data.
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

export default Index;
