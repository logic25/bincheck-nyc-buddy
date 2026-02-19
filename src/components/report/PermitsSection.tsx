import { useState, Fragment } from "react";
import { DOBPermit } from "@/types/property";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, ChevronDown, ChevronRight } from "lucide-react";

interface PermitsSectionProps {
  permits: DOBPermit[];
}

function formatDate(d: string) {
  if (!d) return "—";
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear().toString().slice(-2)}`;
  } catch { return d; }
}

function cleanFloorApt(floor?: string, apt?: string): string {
  const parts: string[] = [];
  if (floor && floor.trim() && !['N/A', 'NA', '-'].includes(floor.trim().toUpperCase())) parts.push(floor.trim());
  if (apt && apt.trim() && !['N/A', 'NA', '-'].includes(apt.trim().toUpperCase())) parts.push(apt.trim());
  return parts.join(' / ') || '—';
}

function PermitRow({ permit }: { permit: DOBPermit }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Fragment>
      <TableRow
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <TableCell className="w-8">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}>
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
        </TableCell>
        <TableCell className="font-mono text-sm">{permit.job__ || '—'}</TableCell>
        <TableCell>{formatDate(permit.filing_date)}</TableCell>
        <TableCell>{cleanFloorApt(permit.floor, permit.apartment)}</TableCell>
        <TableCell className="max-w-[250px] truncate" title={permit.job_description || ''}>
          {permit.job_description?.slice(0, 50) || permit.work_type || '—'}
          {(permit.job_description?.length || 0) > 50 ? '...' : ''}
        </TableCell>
        <TableCell>
          <Badge variant="outline">{permit.job_status_descrp || permit.job_status || '—'}</Badge>
        </TableCell>
      </TableRow>
      {isOpen && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={6} className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              {permit.job_type && (
                <div>
                  <p className="text-muted-foreground">Job Type</p>
                  <p className="font-medium">{permit.job_type}</p>
                </div>
              )}
              {permit.permit_type && (
                <div>
                  <p className="text-muted-foreground">Permit Type</p>
                  <p className="font-medium">{permit.permit_type}</p>
                </div>
              )}
              {permit.work_type && (
                <div>
                  <p className="text-muted-foreground">Work Type</p>
                  <p className="font-medium">{permit.work_type}</p>
                </div>
              )}
              {permit.filing_status && (
                <div>
                  <p className="text-muted-foreground">Filing Status</p>
                  <p className="font-medium">{permit.filing_status}</p>
                </div>
              )}
              {permit.permit_status && (
                <div>
                  <p className="text-muted-foreground">Permit Status</p>
                  <p className="font-medium">{permit.permit_status}</p>
                </div>
              )}
              {(permit.applicant_s_first_name || permit.applicant_s_last_name) && (
                <div>
                  <p className="text-muted-foreground">Applicant</p>
                  <p className="font-medium">{permit.applicant_s_first_name} {permit.applicant_s_last_name}</p>
                </div>
              )}
              {permit.job_description && (
                <div className="col-span-full">
                  <p className="text-muted-foreground">Full Description</p>
                  <p className="font-medium">{permit.job_description}</p>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
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
          <ScrollArea className="h-[500px]">
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Application #</TableHead>
                  <TableHead>Date Filed</TableHead>
                  <TableHead>Floor/Apt</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {permits.slice(0, 50).map((p, i) => (
                  <PermitRow key={p.job__ || i} permit={p} />
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
