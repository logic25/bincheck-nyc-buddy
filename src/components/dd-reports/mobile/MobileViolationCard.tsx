import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import { getAgencyColor, getAgencyLookupUrl } from "@/lib/violation-utils";
import InlineNoteEditor from "../InlineNoteEditor";

interface EditStatus {
  status: "pending" | "approved" | "rejected";
  id: string;
}

interface MobileViolationCardProps {
  violation: any;
  index: number;
  note: string;
  onNoteChange: (note: string) => void;
  bbl?: string | null;
  readOnly?: boolean;
  reportId: string;
  editStatus?: EditStatus | null;
  onEditSaved?: (editId: string) => void;
  bulkMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "—";
  try {
    if (/^\d{8}$/.test(dateStr)) {
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      return `${month}/${day}/${year.slice(-2)}`;
    }
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return `${(date.getMonth() + 1).toString().padStart(2, "0")}/${date
      .getDate()
      .toString()
      .padStart(2, "0")}/${date.getFullYear().toString().slice(-2)}`;
  } catch {
    return dateStr;
  }
};

export default function MobileViolationCard({
  violation,
  index,
  note,
  onNoteChange,
  bbl,
  readOnly = false,
  reportId,
  editStatus,
  onEditSaved,
  bulkMode = false,
  isSelected = false,
  onToggleSelect,
}: MobileViolationCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  const violationId = useMemo(
    () => violation?.violation_number || violation?.id || String(index),
    [violation, index],
  );

  const getSeverityVariant = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case "critical":
      case "immediately hazardous":
      case "class c":
      case "v-dob":
        return "destructive" as const;
      case "major":
      case "hazardous":
      case "class b":
        return "secondary" as const;
      default:
        return "outline" as const;
    }
  };

  const hasEdit = !!editStatus;

  return (
    <div className="bg-card">
      <div
        className="px-3 py-3"
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setIsOpen((v) => !v);
        }}
      >
        <div className="flex items-start gap-2">
          <div className="pt-0.5 shrink-0">
            {bulkMode ? (
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelect?.()}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen((v) => !v);
                }}
                aria-label={isOpen ? "Collapse" : "Expand"}
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="font-mono text-sm font-medium truncate">{violationId}</p>
              <Badge
                variant={violation?.status === "open" ? "destructive" : "default"}
                className="shrink-0"
              >
                {violation?.status || "—"}
              </Badge>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={getAgencyColor(violation?.agency)}>
                {violation?.agency || "—"}
              </Badge>
              <Badge variant={getSeverityVariant(violation?.severity || violation?.violation_class)}>
                {violation?.severity || violation?.violation_class || "Unknown"}
              </Badge>
              <span className="text-xs text-muted-foreground">Issued {formatDate(violation?.issued_date)}</span>
              {hasEdit && (
                <Badge
                  variant={editStatus!.status === "rejected" ? "destructive" : "outline"}
                  className="text-[10px] px-1.5 py-0 shrink-0"
                >
                  {editStatus!.status === "approved"
                    ? "✓"
                    : editStatus!.status === "pending"
                      ? "⏳"
                      : "✗"}
                </Badge>
              )}
            </div>

            {violation?.violation_type && (
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                {violation.violation_type}
              </p>
            )}
          </div>
        </div>

        {isOpen && (
          <div className="mt-3 pt-3 border-t border-border space-y-3">
            {violation?.description_raw && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                <p className="text-sm whitespace-pre-wrap break-words">{violation.description_raw}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              {violation?.hearing_date && (
                <div>
                  <p className="text-xs text-muted-foreground">Hearing</p>
                  <p className="font-medium">{formatDate(violation.hearing_date)}</p>
                </div>
              )}
              {violation?.penalty_amount && (
                <div>
                  <p className="text-xs text-muted-foreground">Penalty</p>
                  <p className="font-medium">${Number(violation.penalty_amount).toLocaleString()}</p>
                </div>
              )}
              {violation?.disposition && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Disposition</p>
                  <p className="font-medium break-words">{violation.disposition}</p>
                </div>
              )}
              {(violation?.apartment || violation?.story) && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Location</p>
                  <p className="font-medium">
                    {[violation?.story ? `Floor ${violation.story}` : null, violation?.apartment ? `Apt ${violation.apartment}` : null]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </div>
              )}
            </div>

            <InlineNoteEditor
              note={note}
              onNoteChange={onNoteChange}
              reportId={reportId}
              itemType="violation"
              itemIdentifier={violationId}
              agency={violation?.agency || "DOB"}
              readOnly={readOnly}
              editStatus={editStatus}
              onEditSaved={onEditSaved}
            />

            <div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(getAgencyLookupUrl(violation?.agency, violationId, bbl), "_blank");
                }}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View on {violation?.agency || "Agency"} Portal
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
