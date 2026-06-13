import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, Mail, FileText, Loader2 } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

/**
 * Lead capture dialog. Anyone (anon or authenticated) can submit; the
 * submit_lead() RPC validates + rate-limits server-side.
 *
 * Usage:
 *   <LeadCaptureDialog intent="sample">
 *     <Button>Get a free sample report</Button>
 *   </LeadCaptureDialog>
 *
 * The wrapping <DialogTrigger> renders whatever child you pass.
 *
 * UTM params are pulled from the current URL so the lead row carries
 * attribution. Referrer is captured at submit-time, not page-load, so
 * SPA route changes still record the right source.
 */

interface LeadCaptureDialogProps {
  children: React.ReactNode;
  intent?: "sample" | "pricing" | "enterprise" | "general";
  /** Pre-fill the property address (e.g. from the search bar). */
  defaultAddress?: string;
  /** Pre-fill the email (e.g. from a logged-in user). */
  defaultEmail?: string;
  /** Override the title and CTA copy. */
  title?: string;
  description?: string;
  submitLabel?: string;
}

const INTENT_TITLES: Record<NonNullable<LeadCaptureDialogProps["intent"]>, { title: string; description: string; submit: string }> = {
  sample: {
    title: "See a sample report",
    description: "Tell us who you are and we'll point you at a sample.",
    submit: "Continue",
  },
  pricing: {
    title: "Talk to us about pricing",
    description: "Tell us about your firm and the volume you're running. We'll come back with the right plan — usually within one business day.",
    submit: "Request pricing",
  },
  enterprise: {
    title: "Enterprise inquiry",
    description: "For law firms, title companies, and shops running 10+ reports a month. We'll reach out to set up a 15-minute call.",
    submit: "Contact sales",
  },
  general: {
    title: "Get in touch",
    description: "Drop us a note and we'll get back to you.",
    submit: "Send message",
  },
};

function getUtmParams() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get("utm_source") ?? undefined,
    utm_medium: params.get("utm_medium") ?? undefined,
    utm_campaign: params.get("utm_campaign") ?? undefined,
  };
}

const LeadCaptureDialog = ({
  children,
  intent = "sample",
  defaultAddress = "",
  defaultEmail = "",
  title,
  description,
  submitLabel,
}: LeadCaptureDialogProps) => {
  const copy = INTENT_TITLES[intent];
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [email, setEmail] = useState(defaultEmail);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!email || email.length < 5 || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    setSubmitting(true);
    try {
      const utm = getUtmParams();
      const { data, error } = await supabase.rpc("submit_lead", {
        _email: email,
        _name: name || null,
        _company: company || null,
        _role: role || null,
        _property_address: null,
        _intent: intent,
        _message: null,
        _utm_source: utm.utm_source ?? null,
        _utm_medium: utm.utm_medium ?? null,
        _utm_campaign: utm.utm_campaign ?? null,
        _referrer: typeof document !== "undefined" ? document.referrer || null : null,
        _user_agent: typeof navigator !== "undefined" ? navigator.userAgent || null : null,
      });
      if (error) throw error;
      const result = data as { ok?: boolean } | null;
      if (!result?.ok) {
        throw new Error("Submission failed");
      }
      setSubmitted(true);
      trackEvent("lead_submitted", { intent });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Try again or email hello@binchecknyc.com directly.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setSubmitted(false);
    setEmail(defaultEmail);
    setName("");
    setCompany("");
    setRole("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) trackEvent("lead_opened", { intent }); if (!v) reset(); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {submitted ? (
          <div className="text-center py-6 space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-primary" />
            </div>
            <DialogHeader className="space-y-2">
              <DialogTitle className="text-center">You're on the list</DialogTitle>
              <DialogDescription className="text-center">
                {intent === "sample"
                  ? "We'll send the sample report to your inbox shortly. Keep an eye out from hello@binchecknyc.com."
                  : "Thanks — someone from our team will be in touch within one business day."}
              </DialogDescription>
            </DialogHeader>
            <Button onClick={() => setOpen(false)} className="w-full">Close</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="mb-3 inline-flex items-center gap-2 text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full w-fit">
                {intent === "sample" ? <FileText className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                {intent === "sample" ? "Free sample" : intent === "pricing" ? "Pricing" : intent === "enterprise" ? "Enterprise" : "Contact"}
              </div>
              <DialogTitle>{title ?? copy.title}</DialogTitle>
              <DialogDescription>{description ?? copy.description}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3 mt-2">
              <div className="space-y-1.5">
                <Label htmlFor="lc-email">Work email *</Label>
                <Input
                  id="lc-email"
                  type="email"
                  required
                  placeholder="you@firm.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="lc-name">Name</Label>
                  <Input
                    id="lc-name"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lc-company">Firm</Label>
                  <Input
                    id="lc-company"
                    placeholder="Law firm / company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    autoComplete="organization"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lc-role">Your role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id="lc-role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="attorney">Real estate attorney</SelectItem>
                    <SelectItem value="investor">Investor / fund</SelectItem>
                    <SelectItem value="broker">Broker</SelectItem>
                    <SelectItem value="title">Title company</SelectItem>
                    <SelectItem value="developer">Developer / sponsor</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {intent === "sample" && (
                <div className="space-y-1.5">
                  <Label htmlFor="lc-addr">Property address (optional)</Label>
                  <Input
                    id="lc-addr"
                    placeholder="123 Main St, Manhattan, NY"
                    value={propertyAddress}
                    onChange={(e) => setPropertyAddress(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">If you give us a real address, we'll send a sample with real findings on it.</p>
                </div>
              )}
              {intent !== "sample" && (
                <div className="space-y-1.5">
                  <Label htmlFor="lc-msg">Anything we should know? (optional)</Label>
                  <Textarea
                    id="lc-msg"
                    placeholder="Volume, timeline, specific use case…"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                  />
                </div>
              )}
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</>
                ) : (
                  submitLabel ?? copy.submit
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                No spam. We'll never share your email. Unsubscribe anytime.
              </p>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default LeadCaptureDialog;
