import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Shield, MapPin, ArrowRight, ArrowLeft, CheckCircle, Clock, Zap, Lock, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface GeoSuggestion { label: string; }

const TOMORROW = new Date();
TOMORROW.setDate(TOMORROW.getDate() + 1);
const MIN_DATE = TOMORROW.toISOString().split("T")[0];

// Format phone number as (XXX) XXX-XXXX
const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const Order = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPlan = searchParams.get("plan") === "professional" ? "professional" : "one-time";

  const [step, setStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [leadSaved, setLeadSaved] = useState(false);

  // Step 1 — Property
  const [address, setAddress] = useState("");
  const [concern, setConcern] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [rush, setRush] = useState(false);
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Step 2 — Contact
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");

  // Step 3 — Plan
  const [plan, setPlan] = useState<"one-time" | "professional">(initialPlan as any);

  const fetchSuggestions = useCallback(async (text: string) => {
    if (text.length < 3 || /^\d+$/.test(text.trim())) { setSuggestions([]); return; }
    try {
      const res = await fetch(`https://geosearch.planninglabs.nyc/v2/autocomplete?text=${encodeURIComponent(text)}&size=6`);
      if (!res.ok) return;
      const data = await res.json();
      const results: GeoSuggestion[] = (data.features || []).map((f: any) => ({ label: f.properties?.label || "" }));
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setHighlightedIndex(-1);
    } catch { setSuggestions([]); }
  }, []);

  const handleAddressChange = (v: string) => {
    setAddress(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 200);
  };

  const selectSuggestion = (label: string) => {
    setAddress(label);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleAddressKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || !suggestions.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlightedIndex(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightedIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && highlightedIndex >= 0) { e.preventDefault(); selectSuggestion(suggestions[highlightedIndex].label); }
    else if (e.key === "Escape") setShowSuggestions(false);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Save lead when user fills contact step and moves to step 3
  const saveLead = useCallback(async (stepReached: number, converted = false) => {
    if (!email.trim().includes("@") || leadSaved) return;
    try {
      await supabase.from("order_leads" as any).insert({
        email: email.trim(),
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        company: company.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        concern: concern.trim() || null,
        rush_requested: rush,
        requested_delivery_date: deliveryDate || null,
        step_reached: stepReached,
        converted,
      });
      setLeadSaved(true);
    } catch { /* silently fail — lead capture is best-effort */ }
  }, [email, firstName, lastName, company, phone, address, concern, rush, deliveryDate, leadSaved]);

  const step1Valid = address.trim().length > 5;
  const step2Valid = firstName.trim() && lastName.trim() && email.trim().includes("@") && company.trim();

  const totalPrice = plan === "professional" ? 599 : rush ? 274 : 199;
  const priceLabel = plan === "professional" ? "$599/mo" : rush ? "$274" : "$199";

  const handleContinueToPayment = () => {
    saveLead(3);
    setStep(3);
  };

  const handlePayAndOrder = async () => {
    setIsProcessing(true);
    // Mark lead as converted
    saveLead(3, true);
    // Mock payment processing — Stripe not wired yet
    await new Promise(r => setTimeout(r, 2000));
    setIsProcessing(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b border-border/40 bg-background/90 backdrop-blur-md sticky top-0 z-50">
          <div className="container flex items-center h-16">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
              <Shield className="h-6 w-6 text-primary" />
              <span className="font-display text-xl tracking-tight">BinCheck<span className="text-primary">NYC</span></span>
            </div>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-2xl font-bold">Order received!</h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                We're preparing your report for <span className="font-semibold text-foreground">{address}</span>.<br />
                You'll receive an email at <span className="font-semibold text-foreground">{email}</span> when it's ready.
              </p>
            </div>
            {(deliveryDate || rush) && (
              <div className="flex items-center justify-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{rush ? "Rush — expected within" : "Expected by"}</span>
                <span className="font-semibold">{rush ? "4 business hours" : deliveryDate}</span>
                {rush && <Badge className="bg-destructive text-destructive-foreground text-xs">RUSH</Badge>}
              </div>
            )}
            {!rush && !deliveryDate && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Typical turnaround: 24–48 business hours</span>
              </div>
            )}
            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={() => navigate("/dashboard")}>Go to My Portal</Button>
              <Button variant="ghost" onClick={() => navigate("/")}>Back to Home</Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/40 bg-background/90 backdrop-blur-md sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <Shield className="h-6 w-6 text-primary" />
            <span className="font-display text-xl tracking-tight">BinCheck<span className="text-primary">NYC</span></span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </div>
      </header>

      <main className="flex-1 container max-w-2xl py-10 px-4 space-y-8">
        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                s < step ? "bg-primary text-primary-foreground" :
                s === step ? "bg-primary text-primary-foreground ring-2 ring-primary/30" :
                "bg-muted text-muted-foreground"
              )}>
                {s < step ? <CheckCircle className="h-4 w-4" /> : s}
              </div>
              <span className={cn("text-sm hidden sm:block", s === step ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {s === 1 ? "Property" : s === 2 ? "Contact" : "Payment"}
              </span>
              {s < 3 && <div className="flex-1 h-px bg-border mx-2 hidden sm:block w-8" />}
            </div>
          ))}
        </div>

        {/* Step 1: Property */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h1 className="font-display text-2xl font-bold">Property Details</h1>
              <p className="text-muted-foreground text-sm mt-1">Tell us about the property and any specific concerns.</p>
            </div>

            <div className="space-y-2" ref={wrapperRef}>
              <Label>Property Address *</Label>
              <div className="relative">
                <div className="flex items-center bg-card border border-border rounded-lg overflow-visible">
                  <MapPin className="h-4 w-4 text-muted-foreground ml-3 shrink-0" />
                  <Input
                    value={address}
                    onChange={(e) => handleAddressChange(e.target.value)}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    onKeyDown={handleAddressKeyDown}
                    placeholder="e.g. 708 E Tremont Ave, Bronx, NY"
                    className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 pl-2"
                    autoComplete="off"
                  />
                </div>
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                    {suggestions.map((s, i) => (
                      <button key={i} type="button"
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${i === highlightedIndex ? "bg-muted" : "hover:bg-muted/50"}`}
                        onClick={() => selectSuggestion(s.label)}
                        onMouseEnter={() => setHighlightedIndex(i)}
                      >
                        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate">{s.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Enter a complete NYC address including borough</p>
            </div>

            <div className="space-y-2">
              <Label>What should we look for? <span className="text-muted-foreground">(Optional)</span></Label>
              <Textarea
                placeholder="e.g. I'm buying Unit 10B and want to ensure no violations or permits affect it, and that future combination work is possible"
                value={concern}
                onChange={(e) => setConcern(e.target.value)}
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">This helps our analysts tailor notes to your specific transaction</p>
            </div>

            <div className="space-y-2">
              <Label>Preferred Delivery Date <span className="text-muted-foreground">(Optional)</span></Label>
              <Input type="date" min={MIN_DATE} value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
              <p className="text-xs text-muted-foreground">Typical turnaround is 24–48 business hours without rush</p>
            </div>

            {/* Rush toggle */}
            <Card className={cn("cursor-pointer border-2 transition-colors", rush ? "border-primary bg-primary/5" : "border-border hover:border-border/80")}
              onClick={() => setRush(!rush)}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", rush ? "bg-primary/15" : "bg-muted")}>
                    <Zap className={cn("h-4 w-4", rush ? "text-primary" : "text-muted-foreground")} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Rush Delivery</p>
                    <p className="text-xs text-muted-foreground">Guaranteed within 4 business hours of order confirmation</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={rush ? "default" : "outline"} className="text-xs">+$75</Badge>
                  <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors",
                    rush ? "border-primary bg-primary" : "border-muted-foreground")}>
                    {rush && <div className="w-2 h-2 rounded-full bg-primary-foreground" />}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button className="w-full" onClick={() => setStep(2)} disabled={!step1Valid}>
              Continue to Contact Info <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Step 2: Contact */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h1 className="font-display text-2xl font-bold">Contact Information</h1>
              <p className="text-muted-foreground text-sm mt-1">We'll send your report to this email when it's ready.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input placeholder="Jane" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Last Name *</Label>
                <Input placeholder="Smith" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email Address *</Label>
              <Input type="email" placeholder="jane@smithlaw.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Company / Firm *</Label>
              <Input placeholder="Smith & Associates, LLC" value={company} onChange={(e) => setCompany(e.target.value)} />
              <p className="text-xs text-muted-foreground">Law firm, title company, investment firm, or individual</p>
            </div>
            <div className="space-y-2">
              <Label>Phone <span className="text-muted-foreground">(Optional)</span></Label>
              <Input
                type="tel"
                placeholder="(212) 555-0100"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                maxLength={14}
              />
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button className="flex-1" onClick={handleContinueToPayment} disabled={!step2Valid}>
                Continue to Payment <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Plan & Payment */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h1 className="font-display text-2xl font-bold">Choose Your Plan</h1>
              <p className="text-muted-foreground text-sm mt-1">Select the option that fits your needs.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* One-Time */}
              <Card
                className={cn("cursor-pointer border-2 transition-colors", plan === "one-time" ? "border-primary" : "border-border hover:border-border/80")}
                onClick={() => setPlan("one-time")}
              >
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">One-Time Report</p>
                      <p className="font-display text-3xl font-extrabold mt-1">{rush ? "$274" : "$199"}</p>
                      {rush && <p className="text-xs text-primary font-medium">Includes $75 rush fee</p>}
                    </div>
                    <div className={cn("w-5 h-5 rounded-full border-2 mt-1 flex items-center justify-center transition-colors",
                      plan === "one-time" ? "border-primary bg-primary" : "border-muted-foreground")}>
                      {plan === "one-time" && <div className="w-2.5 h-2.5 rounded-full bg-primary-foreground" />}
                    </div>
                  </div>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {[
                      "8-agency violation search (DOB, ECB, HPD, FDNY, DSNY, DOT, LPC, DOF)",
                      "AI analyst notes on every line item",
                      "Attorney-ready PDF report",
                      `${rush ? "4-hour rush" : "24–48 hr"} delivery`,
                      "One-time purchase, no subscription"
                    ].map(f => (
                      <li key={f} className="flex items-start gap-2"><CheckCircle className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" /> {f}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Professional */}
              <Card
                className={cn("cursor-pointer border-2 transition-colors relative", plan === "professional" ? "border-primary" : "border-border hover:border-border/80")}
                onClick={() => setPlan("professional")}
              >
                <div className="absolute -top-3 left-4">
                  <Badge className="bg-primary text-primary-foreground text-xs">Most Popular</Badge>
                </div>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">Professional</p>
                      <p className="font-display text-3xl font-extrabold mt-1">$599<span className="text-base font-normal text-muted-foreground">/mo</span></p>
                      <p className="text-xs text-muted-foreground">5 reports · $120/report</p>
                    </div>
                    <div className={cn("w-5 h-5 rounded-full border-2 mt-1 flex items-center justify-center transition-colors",
                      plan === "professional" ? "border-primary bg-primary" : "border-muted-foreground")}>
                      {plan === "professional" && <div className="w-2.5 h-2.5 rounded-full bg-primary-foreground" />}
                    </div>
                  </div>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {[
                      "Everything in One-Time (all 8 agencies, AI notes, PDF)",
                      "Priority processing queue — moves to front",
                      "Rush delivery at no extra charge",
                      "White-label PDF option",
                      "Rollover unused reports"
                    ].map(f => (
                      <li key={f} className="flex items-start gap-2"><CheckCircle className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" /> {f}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            {/* Order summary */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-semibold">Order Summary</p>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div className="flex justify-between"><span>{address}</span></div>
                  {concern && <div className="text-xs italic">"{concern.slice(0, 80)}{concern.length > 80 ? '...' : ''}"</div>}
                  <div className="flex justify-between"><span>Prepared for:</span><span className="font-medium text-foreground">{firstName} {lastName} · {company}</span></div>
                  {deliveryDate && !rush && <div className="flex justify-between"><span>Requested by:</span><span>{deliveryDate}</span></div>}
                  {rush && <div className="flex justify-between text-primary font-medium"><span>Rush delivery (4 hrs)</span><span>+$75</span></div>}
                  {!rush && (
                    <div className="flex items-center gap-1 text-xs">
                      <Clock className="h-3 w-3" />
                      <span>Typical turnaround: 24–48 business hours</span>
                    </div>
                  )}
                </div>
                <div className="border-t border-border pt-2 flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{priceLabel}</span>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              <Button className="w-full" size="lg" onClick={handlePayAndOrder} disabled={isProcessing}>
                {isProcessing ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing payment...</>
                ) : (
                  <><Lock className="h-4 w-4 mr-2" /> Pay {priceLabel} &amp; Order Report</>
                )}
              </Button>
              <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Secured by Stripe</span>
                <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Payment UI — Stripe not yet wired</span>
              </div>
              <Button variant="ghost" className="w-full" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Footer disclaimer */}
      <footer className="border-t border-border/40 py-6 mt-8">
        <div className="container max-w-2xl text-center text-xs text-muted-foreground space-y-1">
          <p>Reports draw from NYC DOB, ECB, HPD, FDNY, DSNY, DOT, LPC, DOF, and DEP public records.</p>
          <p>For informational purposes only. Not legal advice. Results depend on the completeness of public agency records at time of search.</p>
        </div>
      </footer>
    </div>
  );
};

export default Order;
