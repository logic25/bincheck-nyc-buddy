import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Building2, Shield, FileText, ArrowRight, AlertTriangle, MapPin, LogOut, Settings } from "lucide-react";
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
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
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

  // Close on outside click
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
                <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
                  Dashboard
                </Button>
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
                <Button size="sm" onClick={() => navigate("/auth?tab=signup")}>
                  Sign Up
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-3xl w-full text-center space-y-10">
          <div className="space-y-5">
            <h1 className="font-display text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.1]">
              Due diligence,{" "}
              <span className="text-primary">delivered.</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              The definitive NYC property risk platform for real estate transactions. Open violations, stop work orders, and AI-powered risk analysis — built for attorneys, investors, and deal teams.
            </p>
          </div>

          {/* Search with autocomplete */}
          <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto" ref={wrapperRef}>
            <div className="relative flex items-center bg-card border border-border rounded-lg overflow-visible shadow-sm">
              <Search className="h-5 w-5 text-muted-foreground ml-4 shrink-0" />
              <Input
                value={query}
                onChange={(e) => handleInputChange(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onKeyDown={handleKeyDown}
                placeholder="Enter BIN number or NYC address..."
                className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base h-14 pl-3"
                autoComplete="off"
              />
              <Button type="submit" size="lg" className="m-1.5 shrink-0 font-semibold">
                Search
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>

            {/* Suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                      i === highlightedIndex ? "bg-muted" : "hover:bg-muted/50"
                    }`}
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

          <p className="text-sm text-muted-foreground">
            Free to search. Sign in to generate transaction-ready DD reports and share with counsel.
          </p>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            {[
              { icon: Building2, title: "Open Violations", desc: "DOB, ECB & HPD violations that affect closing — with severity and penalty data" },
              { icon: AlertTriangle, title: "Critical Orders", desc: "Stop work orders, vacate orders, and enforcement actions that can kill a deal" },
              { icon: FileText, title: "DD Reports", desc: "Transaction-ready reports with AI risk analysis — built to share with attorneys and stakeholders" },
            ].map((f) => (
              <div key={f.title} className="p-6 rounded-lg bg-card/50 text-left space-y-3 hover:bg-card transition-colors">
                <f.icon className="h-5 w-5 text-primary" />
                <h3 className="font-display font-semibold text-sm">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6">
        <div className="container text-center text-sm text-muted-foreground">
          Data sourced from NYC DOB, ECB & HPD public records. Not legal or investment advice. © {new Date().getFullYear()} BinCheckNYC
        </div>
      </footer>
    </div>
  );
};

export default Index;
