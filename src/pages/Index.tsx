import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Building2, Shield, FileText, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const Index = () => {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    const isNumeric = /^\d+$/.test(query.trim());
    navigate(`/report?${isNumeric ? "bin" : "address"}=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Nav */}
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="font-display text-xl font-bold tracking-tight">BinCheck<span className="text-primary">NYC</span></span>
          </div>
          <nav className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>
              Log In
            </Button>
            <Button size="sm" onClick={() => navigate("/auth?tab=signup")}>
              Sign Up
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-3xl w-full text-center space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary text-sm font-medium">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-glow" />
              NYC Property Due Diligence
            </div>
            <h1 className="font-display text-5xl md:text-6xl font-bold tracking-tight leading-tight">
              Property compliance,{" "}
              <span className="text-primary">instantly verified</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Search any NYC property by BIN or address. Get DOB, ECB, and HPD violation reports with compliance scoring — all from public data.
            </p>
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-primary/20 rounded-lg blur opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
              <div className="relative flex items-center bg-card border border-border rounded-lg overflow-hidden">
                <Search className="h-5 w-5 text-muted-foreground ml-4 shrink-0" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter BIN number or NYC address..."
                  className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base h-14 pl-3"
                />
                <Button type="submit" size="lg" className="m-1.5 shrink-0 font-semibold">
                  Search
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </form>

          <p className="text-sm text-muted-foreground">
            Free to search. Sign in to save reports and export PDFs.
          </p>

          {/* Feature cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-8">
            {[
              { icon: Building2, title: "DOB Violations", desc: "Building code violations, complaints, and enforcement actions" },
              { icon: Shield, title: "HPD Records", desc: "Housing preservation violations by class severity (A/B/C)" },
              { icon: FileText, title: "ECB Penalties", desc: "Environmental control board violations and penalty amounts" },
            ].map((f) => (
              <div key={f.title} className="p-5 rounded-lg border border-border bg-card/50 text-left space-y-2">
                <f.icon className="h-5 w-5 text-primary" />
                <h3 className="font-display font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-6">
        <div className="container text-center text-sm text-muted-foreground">
          Data sourced from NYC Open Data. Not legal advice. © {new Date().getFullYear()} BinCheckNYC
        </div>
      </footer>
    </div>
  );
};

export default Index;
