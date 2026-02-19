import { DOBPermit } from "@/types/property";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";

interface PermitsSectionProps {
  permits: DOBPermit[];
}

function formatDate(d: string) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString(); } catch { return d; }
}

export function PermitsSection({ permits }: PermitsSectionProps) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-primary" />
          Permits & Applications
          <span className="text-xs text-muted-foreground font-normal">({permits.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {permits.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No permits found</p>
        ) : (
          <Accordion type="multiple" className="w-full">
            {permits.slice(0, 50).map((p, i) => (
              <AccordionItem key={p.job__ || i} value={`permit-${i}`}>
                <AccordionTrigger className="text-sm hover:no-underline py-3">
                  <div className="flex items-center gap-3 text-left w-full mr-4">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{p.job_type || "Job"} — {p.work_type || p.permit_type || "Permit"}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatDate(p.filing_date)}</span>
                    <Badge variant="outline" className="text-xs shrink-0">{p.job_status_descrp || p.job_status || "Unknown"}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-2 gap-2 text-sm pl-7">
                    {p.job__ && <div><span className="text-muted-foreground">Job #:</span> <span className="font-mono">{p.job__}</span></div>}
                    {p.permit_type && <div><span className="text-muted-foreground">Permit Type:</span> {p.permit_type}</div>}
                    {p.filing_status && <div><span className="text-muted-foreground">Filing Status:</span> {p.filing_status}</div>}
                    {p.permit_status && <div><span className="text-muted-foreground">Permit Status:</span> {p.permit_status}</div>}
                    {p.work_type && <div><span className="text-muted-foreground">Work Type:</span> {p.work_type}</div>}
                    {(p.applicant_s_first_name || p.applicant_s_last_name) && (
                      <div><span className="text-muted-foreground">Applicant:</span> {p.applicant_s_first_name} {p.applicant_s_last_name}</div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
