import { PropertyData } from "@/types/property";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Building2, Home } from "lucide-react";

interface ViolationsSectionProps {
  data: PropertyData;
}

function formatDate(d: string) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return d;
  }
}

function statusBadge(status: string) {
  const s = status?.toLowerCase() || "";
  if (s.includes("active") || s.includes("open")) return <Badge variant="destructive" className="text-xs">{status}</Badge>;
  if (s.includes("close") || s.includes("resolve") || s.includes("dismiss")) return <Badge variant="secondary" className="text-xs">{status}</Badge>;
  return <Badge variant="outline" className="text-xs">{status || "Unknown"}</Badge>;
}

export function ViolationsSection({ data }: ViolationsSectionProps) {
  const activeDOB = data.dobViolations.filter(v => v.status?.toLowerCase() !== 'closed');
  const activeECB = data.ecbViolations.filter(v => v.status?.toLowerCase() !== 'resolve' && v.status?.toLowerCase() !== 'closed');
  const activeHPD = data.hpdViolations.filter(v => v.violationstatus?.toLowerCase() !== 'close');

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-primary" />
          Violations
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="dob" className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="dob" className="text-xs sm:text-sm">
              DOB <span className="ml-1 text-xs opacity-70">({activeDOB.length})</span>
            </TabsTrigger>
            <TabsTrigger value="ecb" className="text-xs sm:text-sm">
              ECB <span className="ml-1 text-xs opacity-70">({activeECB.length})</span>
            </TabsTrigger>
            <TabsTrigger value="hpd" className="text-xs sm:text-sm">
              HPD <span className="ml-1 text-xs opacity-70">({activeHPD.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* DOB */}
          <TabsContent value="dob">
            {data.dobViolations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No DOB violations found</p>
            ) : (
              <Accordion type="multiple" className="w-full">
                {data.dobViolations.slice(0, 50).map((v, i) => (
                  <AccordionItem key={v.isn_dob_bis_viol || i} value={`dob-${i}`}>
                    <AccordionTrigger className="text-sm hover:no-underline py-3">
                      <div className="flex items-center gap-3 text-left w-full mr-4">
                        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{v.violation_type || v.description || "Violation"}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{formatDate(v.violation_date)}</span>
                        {statusBadge(v.status)}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-2 text-sm pl-7">
                        {v.violation_number && <div><span className="text-muted-foreground">Number:</span> <span className="font-mono">{v.violation_number}</span></div>}
                        {v.violation_category && <div><span className="text-muted-foreground">Category:</span> {v.violation_category}</div>}
                        {v.severity && <div><span className="text-muted-foreground">Severity:</span> {v.severity}</div>}
                        {v.device_type && <div><span className="text-muted-foreground">Device:</span> {v.device_type}</div>}
                        {v.disposition_comments && <div className="col-span-2"><span className="text-muted-foreground">Disposition:</span> {v.disposition_comments}</div>}
                        {v.description && <div className="col-span-2"><span className="text-muted-foreground">Description:</span> {v.description}</div>}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </TabsContent>

          {/* ECB */}
          <TabsContent value="ecb">
            {data.ecbViolations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No ECB violations found</p>
            ) : (
              <Accordion type="multiple" className="w-full">
                {data.ecbViolations.slice(0, 50).map((v, i) => (
                  <AccordionItem key={v.ecb_violation_number || i} value={`ecb-${i}`}>
                    <AccordionTrigger className="text-sm hover:no-underline py-3">
                      <div className="flex items-center gap-3 text-left w-full mr-4">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{v.violation_description || v.violation_type || "Violation"}</span>
                        <span className="text-xs font-mono text-muted-foreground shrink-0">${parseFloat(v.penalty_balance_due || '0').toLocaleString()}</span>
                        {statusBadge(v.status)}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-2 text-sm pl-7">
                        {v.ecb_violation_number && <div><span className="text-muted-foreground">ECB #:</span> <span className="font-mono">{v.ecb_violation_number}</span></div>}
                        {v.violation_date && <div><span className="text-muted-foreground">Date:</span> {formatDate(v.violation_date)}</div>}
                        {v.hearing_date_time && <div><span className="text-muted-foreground">Hearing:</span> {formatDate(v.hearing_date_time)}</div>}
                        {v.hearing_result && <div><span className="text-muted-foreground">Result:</span> {v.hearing_result}</div>}
                        {v.infraction_codes && <div><span className="text-muted-foreground">Infraction:</span> {v.infraction_codes}</div>}
                        {v.respondent_name && <div><span className="text-muted-foreground">Respondent:</span> {v.respondent_name}</div>}
                        {v.violation_description && <div className="col-span-2"><span className="text-muted-foreground">Description:</span> {v.violation_description}</div>}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </TabsContent>

          {/* HPD */}
          <TabsContent value="hpd">
            {data.hpdViolations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No HPD violations found</p>
            ) : (
              <Accordion type="multiple" className="w-full">
                {data.hpdViolations.slice(0, 50).map((v, i) => (
                  <AccordionItem key={v.violationid || i} value={`hpd-${i}`}>
                    <AccordionTrigger className="text-sm hover:no-underline py-3">
                      <div className="flex items-center gap-3 text-left w-full mr-4">
                        <Home className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">
                          Class {v.class} — {v.novdescription || v.currentstatus || "Violation"}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">{formatDate(v.inspectiondate)}</span>
                        {statusBadge(v.violationstatus)}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-2 text-sm pl-7">
                        <div><span className="text-muted-foreground">Class:</span> <Badge variant={v.class === 'C' ? 'destructive' : v.class === 'B' ? 'default' : 'secondary'} className="text-xs">{v.class}</Badge></div>
                        <div><span className="text-muted-foreground">Status:</span> {v.currentstatus}</div>
                        {v.ordernumber && <div><span className="text-muted-foreground">Order #:</span> <span className="font-mono">{v.ordernumber}</span></div>}
                        {v.inspectiondate && <div><span className="text-muted-foreground">Inspection:</span> {formatDate(v.inspectiondate)}</div>}
                        {v.certifieddate && <div><span className="text-muted-foreground">Certified:</span> {formatDate(v.certifieddate)}</div>}
                        {v.novdescription && <div className="col-span-2"><span className="text-muted-foreground">Description:</span> {v.novdescription}</div>}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
