import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Building2, Shield, FileText, ArrowRight, AlertTriangle, MapPin, LogOut, Settings, CheckCircle, Clock, Download, Zap, Star, X, Eye, Brain, ClipboardCheck, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import SEO from "@/components/SEO";
import LeadCaptureDialog from "@/components/marketing/LeadCaptureDialog";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { trackEvent } from "@/lib/analytics";

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
        description="Transaction-ready NYC property compliance reports. 8-agency violation search (DOB, ECB, HPD, FDNY, DSNY, DOT, LPC, DOF) with analyst-reviewed line-item notes. 24–48 hour delivery. $499 flat."
        path="/"
      />

      {/* ─── DARK NAVY HERO ─────────────────────────────────────────────── */}
      <div className="bg-[#0c1730] text-white">
        {/* Nav */}
        <header className="border-b border-white/10">
          <div className="container flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#e63946]" />
              <span className="text-lg tracking-tight font-semibold">BinCheck<span className="text-[#e63946]">NYC</span></span>
            </div>
            <nav className="flex items-center gap-1 sm:gap-2">
              {session ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="text-white/80 hover:text-white hover:bg-white/10">Home</Button>
                  <Button variant="ghost" size="sm" onClick={() => navigate("/settings")} className="text-white/80 hover:text-white hover:bg-white/10">
                    <Settings className="h-4 w-4 mr-1" /> Settings
                  </Button>
                  <Button variant="ghost" size="sm" onClick={async () => { await supabase.auth.signOut(); setSession(null); }} className="text-white/80 hover:text-white hover:bg-white/10">
                    <LogOut className="h-4 w-4 mr-1" /> Sign Out
                  </Button>
                </>
              ) : (
                <>
                  <a href="#coverage" className="hidden sm:inline-block px-3 py-2 text-sm text-white/70 hover:text-white">Coverage</a>
                  <a href="#sample" className="hidden sm:inline-block px-3 py-2 text-sm text-white/70 hover:text-white">Sample</a>
                  <a href="#pricing" className="hidden sm:inline-block px-3 py-2 text-sm text-white/70 hover:text-white">Pricing</a>
                  <Button variant="ghost" size="sm" onClick={() => navigate("/auth")} className="text-white/70 hover:text-white hover:bg-white/10">Log in</Button>
                  <Button size="sm" onClick={() => navigate("/order")} className="bg-[#e63946] hover:bg-[#d62b39] text-white font-semibold">
                    Order a report
                  </Button>
                </>
              )}
            </nav>
          </div>
        </header>

        {/* Hero body */}
        <section className="container pt-14 pb-20 lg:pt-20 lg:pb-28">
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-16 items-center">
            {/* Left column — copy + search */}
            <div>
              {session ? (
                <div className="space-y-3 mb-10">
                  <h1 className="font-serif text-4xl md:text-5xl font-bold tracking-tight leading-[1.1]">Property search</h1>
                  <p className="text-white/70">Look up any NYC property by BIN number or address.</p>
                </div>
              ) : (
                <div className="space-y-7 mb-10">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border border-emerald-400/40 bg-emerald-400/5 text-[11px] text-emerald-300 font-bold uppercase tracking-[0.14em]">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> 8-agency NYC compliance report
                  </div>
                  <h1 className="font-serif text-5xl md:text-6xl lg:text-[64px] font-bold tracking-tight leading-[1.05]">
                    Every NYC violation<br />tied to a BIN, in<br />
                    <span className="text-[#e63946] italic">one report.</span>
                  </h1>
                  <p className="text-base md:text-lg text-white/70 max-w-xl leading-relaxed">
                    Open violations, ECB judgments, HPD orders, FDNY findings, OATH tickets, DOB permits, and ACRIS records — pulled from <span className="text-white font-semibold">eight city sources</span>, reviewed by a NYC analyst, delivered as a single PDF.
                  </p>
                </div>
              )}

              {/* Search */}
              <form onSubmit={handleSearch} className="relative max-w-xl" ref={wrapperRef}>
                <div className="relative flex items-center bg-white text-foreground rounded-md overflow-visible shadow-lg">
                  <Input
                    value={query}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    onKeyDown={handleKeyDown}
                    placeholder="e.g. 123 Main St, New York"
                    className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base h-14 pl-5 text-gray-900 placeholder:text-gray-400"
                    autoComplete="off"
                  />
                  <Button type="submit" size="lg" className="m-1.5 shrink-0 font-semibold bg-[#e63946] hover:bg-[#d62b39] text-white">
                    Check property <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-border rounded-md shadow-xl overflow-hidden">
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors text-gray-900 ${i === highlightedIndex ? "bg-gray-100" : "hover:bg-gray-50"}`}
                        onClick={() => selectSuggestion(s.label)}
                        onMouseEnter={() => setHighlightedIndex(i)}
                      >
                        <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
                        <span className="truncate">{s.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </form>

              {!session && (
                <p className="text-xs text-white/50 mt-5">
                  Delivered in 24–48 hours · Flat price per property
                </p>
              )}
            </div>

            {/* Right column — hero card mirrors the real BinCheck DD report */}
            {!session && (
              <div className="relative bg-white text-gray-900 rounded-md shadow-2xl border border-white/10 overflow-hidden">
                {/* SAMPLE watermark */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
                  <span className="font-serif font-bold text-[120px] text-gray-900/[0.045] -rotate-[18deg] tracking-[0.2em] select-none whitespace-nowrap">
                    SAMPLE
                  </span>
                </div>

                {/* Letterhead band */}
                <div className="relative px-6 pt-5 pb-3 bg-white border-b border-gray-300">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="font-serif text-xl font-bold text-[#1e3a5f] tracking-tight">BinCheck</span>
                        <span className="font-serif text-xl font-bold text-[#dc2626] tracking-tight">NYC</span>
                      </div>
                      <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-500 mt-0.5">NYC Property Due Diligence</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-gray-400">Report ID</p>
                      <p className="font-mono text-[10px] font-bold text-gray-700 mt-0.5">BC-20260613-001</p>
                    </div>
                  </div>
                </div>

                {/* Property header */}
                <div className="relative px-6 py-4 border-b border-gray-200">
                  <p className="font-serif text-base font-bold leading-tight">123 Sample Street · Unit 12B</p>
                  <p className="text-[11px] text-gray-500 mt-1 font-mono">BIN 0000000 · Brooklyn, NY · Prepared for Sample Counsel LLP</p>
                </div>

                {/* DOB Violations section */}
                <div className="relative px-6 pt-5 pb-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-black pb-1 mb-3 border-b-[1.5px] border-black">
                    DOB Violations — 3
                  </h3>

                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#991b1b] mb-2">
                    Affects Unit 12B (2)
                  </p>
                  <div className="space-y-2 mb-4">
                    {[
                      { id: 'V012345678', note: 'Issued 03/14/24 for unpermitted partition wall in Unit 12B; affects certificate of occupancy.', status: 'open' },
                      { id: 'V012567890', note: 'Issued 11/02/23 for failed FISP inspection; facade work scheduled for Unit 12B line.', status: 'open' },
                    ].map((row) => (
                      <div key={row.id} className="flex items-start justify-between gap-3 text-[11px]">
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-[10px] text-gray-600">{row.id}</span>
                          <p className="text-gray-800 leading-snug mt-0.5"><em className="not-italic text-gray-700">{row.note}</em></p>
                        </div>
                        <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] border border-red-600 text-red-700 rounded-sm">{row.status}</span>
                      </div>
                    ))}
                  </div>

                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500 mb-2">
                    Other Units / Floors (1)
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3 text-[11px]">
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-[10px] text-gray-600">V011998771</span>
                        <p className="text-gray-800 leading-snug mt-0.5"><em className="not-italic text-gray-700">Issued 07/18/23 for roof bulkhead defect on the 14th-floor mechanical room; no impact on Unit 12B.</em></p>
                      </div>
                      <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] border border-red-600 text-red-700 rounded-sm">open</span>
                    </div>
                  </div>
                </div>

                {/* ECB Violations section */}
                <div className="relative px-6 pb-5">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-black pb-1 mb-3 border-b-[1.5px] border-black">
                    ECB Violations — 1
                  </h3>
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#991b1b] mb-2">
                    Affects Unit 12B (1)
                  </p>
                  <div className="flex items-start justify-between gap-3 text-[11px]">
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-[10px] text-gray-600">E034958721</span>
                      <p className="text-gray-800 leading-snug mt-0.5"><em className="not-italic text-gray-700">Default judgment 09/14/24 — $8,500 balance, lien attachable; tied to Unit 12B alteration.</em></p>
                    </div>
                    <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] border border-red-600 text-red-700 rounded-sm">open</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Bottom strip */}
        {!session && (
          <div className="border-t border-white/10">
            <div className="container py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                Eight city data sources · One PDF · Analyst-reviewed
              </p>
              <span className="inline-flex items-center px-4 py-2 rounded-full border border-[#e63946]/60 bg-[#e63946]/10 text-[#ff7480] text-xs font-bold uppercase tracking-[0.14em]">
                Flat $499 per property
              </span>
            </div>
          </div>
        )}
      </div>

      <main className="flex-1">
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
                    { icon: FileText, title: "Permit Activity", desc: "BIS and DOB NOW permit applications — partial, pending, and in-progress filings flagged for pre-closing review" },
                    { icon: Zap, title: "FDNY, DSNY, DOT, LPC, DOF", desc: "OATH hearing records for all city agencies — open fines, default judgments, and enforcement actions" },
                    { icon: CheckCircle, title: "Analyst-Reviewed Notes", desc: "Per-item factual notes on every line, scoped to your subject unit or whole building. AI-drafted, signed off by a human analyst before delivery." },
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
                    { step: "03", icon: Download, title: "Download & Close", desc: "Receive a transaction-ready PDF with per-item analyst notes, agency sub-scores, and a signed-off conclusion." },
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

            {/* What's actually in the report — analyst signoff strip + inline sample CTA */}
            <section id="sample" className="border-t border-border/40 py-16 px-4">
              <div className="container max-w-4xl">
                <div className="text-center mb-8">
                  <Badge variant="outline" className="mb-3">The deliverable</Badge>
                  <h2 className="font-display text-2xl md:text-3xl font-bold">A transaction-ready PDF, not a CSV dump</h2>
                  <p className="text-muted-foreground text-sm mt-2 max-w-2xl mx-auto">
                    Every BinCheckNYC report is grouped by what affects your subject unit versus the rest of the building, with per-item factual notes scoped to your transaction — drafted by AI, signed off by a human analyst before delivery.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
                  {[
                    { icon: Building2, title: "8 city agencies", desc: "DOB, ECB, HPD, FDNY, DSNY, DOT, LPC, DOF — every record we can legally pull" },
                    { icon: ClipboardCheck, title: "Analyst-reviewed notes", desc: "Per-item factual notes tagged [ACTION REQUIRED], [MONITOR], or [RESOLVED]" },
                    { icon: Eye, title: "Human QA before delivery", desc: "Every report reviewed by an analyst before delivery — not auto-shipped" },
                    { icon: Download, title: "Attorney-ready PDF", desc: "Formatted and citation-ready for closing files and lender packets" },
                  ].map((f) => (
                    <div key={f.title} className="p-5 rounded-lg bg-card/50 border border-border/40 space-y-2">
                      <f.icon className="h-4 w-4 text-primary" />
                      <p className="font-semibold text-sm">{f.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 mt-10">
                  <Button size="lg" onClick={() => { trackEvent("cta_clicked", { cta: "sample_section" }); navigate("/order"); }} className="font-semibold">
                    Order a Report — $499 <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                  <LeadCaptureDialog intent="sample">
                    <Button size="lg" variant="outline" onClick={() => trackEvent("cta_clicked", { cta: "sample" })}>
                      <FileText className="h-4 w-4 mr-2" /> See a sample report
                    </Button>
                  </LeadCaptureDialog>
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
                    Most NYC compliance reports are built for owners managing buildings they already own. BinCheckNYC is built for the deal team asking <span className="italic">"what am I actually buying?"</span>
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
                      { row: "Primary use case", us: "Closing-day decisions", them: "Owner portfolio reporting" },
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
                  <Button size="lg" onClick={() => { trackEvent("cta_clicked", { cta: "compare" }); navigate("/order"); }} className="font-semibold">
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
                      a: "Manually pulling 8 agency portals on a single property takes a paralegal 3–6 hours. Then someone still has to read the results, flag which items are actionable, and assemble a clean closing-file PDF. BinCheckNYC delivers that final product in 24–48 hours for less than the cost of the paralegal time — with analyst-reviewed line-item notes on top.",
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
                    <Button className="w-full" onClick={() => { trackEvent("cta_clicked", { cta: "pricing_onetime" }); navigate("/order"); }}>Order a Report</Button>
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
                    <Button className="w-full" onClick={() => { trackEvent("cta_clicked", { cta: "pricing_pro" }); navigate("/order?plan=professional"); }}>Get Started</Button>
                  </div>

                  {/* Enterprise */}
                  <div className="p-6 rounded-lg border border-border bg-card space-y-5">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Enterprise</p>
                      <p className="font-display text-4xl font-extrabold mt-1">Custom</p>
                      <p className="text-xs text-muted-foreground mt-1">For attorneys, title, brokers, and investors</p>
                    </div>
                    <ul className="space-y-2 text-sm">
                      {["Unlimited reports", "Dedicated account manager", "Custom invoice & billing", "API access (coming soon)", "SLA guarantees"].map(f => (
                        <li key={f} className="flex items-center gap-2">
                          <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="text-muted-foreground">{f}</span>
                        </li>
                      ))}
                    </ul>
                    <LeadCaptureDialog intent="enterprise">
                      <Button variant="outline" className="w-full">Contact Us</Button>
                    </LeadCaptureDialog>
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
