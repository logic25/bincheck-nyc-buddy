import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Building2, Shield, FileText, ArrowRight, AlertTriangle, MapPin, LogOut, Settings, CheckCircle, Clock, Download, Zap, Star, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";

interface GeoSuggestion {
  label: string;
  borough: string;
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
                <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>Dashboard</Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/dd-reports")}>
                  <FileText className="h-4 w-4 mr-1" /> DD Reports
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
                  <Settings className="h-4 w-4 mr-1" /> Settings
                </Button>
                {isAdmin && (
                  <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
                    <Shield className="h-4 w-4 mr-1" /> Admin
                  </Button>
                )}
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
                  Transaction-ready NYC property risk reports for attorneys, investors, and deal teams. Open violations, stop work orders, and AI-powered risk analysis across 8 city agencies.
                </p>
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <Button size="lg" onClick={() => navigate("/order")} className="font-semibold">
                    Order a Report — $199 <ArrowRight className="h-4 w-4 ml-1" />
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
                      <p className="font-display text-4xl font-extrabold mt-1">$199</p>
                      <p className="text-xs text-muted-foreground mt-1">+ $75 for rush delivery</p>
                    </div>
                    <ul className="space-y-2 text-sm">
                      {["8-agency violation search", "AI line-item notes", "Attorney-ready PDF", "24hr delivery", "Rush option available"].map(f => (
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
                      <p className="font-display text-4xl font-extrabold mt-1">$599<span className="text-lg font-normal text-muted-foreground">/mo</span></p>
                      <p className="text-xs text-muted-foreground mt-1">5 reports · $120/report</p>
                    </div>
                    <ul className="space-y-2 text-sm">
                      {["8-agency violation search", "AI line-item notes", "Attorney-ready PDF", "Priority processing queue", "Rush at no extra charge", "White-label PDF option", "Rollover unused reports", "Dedicated support"].map(f => (
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
                    <Button variant="outline" className="w-full" onClick={() => window.location.href = "mailto:hello@bincheckyc.com"}>Contact Us</Button>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-6 mt-8 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Secure payment via Stripe</span>
                  <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> SSL encrypted</span>
                  <span className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5" /> Satisfaction guaranteed</span>
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
            <span className="font-semibold text-foreground/80">Disclaimer:</span> BinCheckNYC reports are compiled from publicly available government records for informational purposes only. This service does not constitute legal advice, title insurance, or a certification of the accuracy or completeness of any public agency record. Public records may be delayed, incomplete, or not yet reflected in agency databases at the time of search. All findings should be independently verified with qualified legal counsel and the relevant city agencies prior to reliance in any transaction. BinCheckNYC, its officers, employees, and affiliates assume no liability for any decisions made based on the contents of any report generated by this service.
          </p>
          <div className="border-t border-border/30 pt-3 flex items-center justify-center gap-4">
            <p>© {new Date().getFullYear()} BinCheckNYC. All rights reserved.</p>
            <span>·</span>
            <a href="mailto:hello@bincheckyc.com" className="hover:text-foreground transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
