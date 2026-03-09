import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ExternalLink, ChevronDown, ChevronRight, EyeOff, Eye } from "lucide-react";
import InlineNoteEditor from "../InlineNoteEditor";

interface EditStatus {
  status: "pending" | "approved" | "rejected";
  id: string;
}

interface MobileApplicationCardProps {
  application: any;
  index: number;
  note: string;
  onNoteChange: (note: string) => void;
  readOnly?: boolean;
  reportId: string;
  editStatus?: EditStatus | null;
  onEditSaved?: (editId: string) => void;
  bulkMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  isAdmin?: boolean;
  onToggleHidden?: () => void;
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

const cleanValue = (val: string | null | undefined): string | null => {
  if (!val) return null;
  const trimmed = val.trim();
  if (trimmed.length <= 2 && !/^\d+$/.test(trimmed)) return null;
  if (["N/A", "NA", "-", "--", "ER", "NONE"].includes(trimmed.toUpperCase())) return null;
  return trimmed;
};

const getStatusVariant = (status: string | null | undefined) => {
  const s = (status || "").toLowerCase();
  if (s.includes("disapprov") || s.includes("denied") || s.includes("withdraw")) return "destructive" as const;
  if (s.includes("approv") && !s.includes("disapprov")) return "secondary" as const;
  if (s.includes("permit") || s.includes("sign-off") || s.includes("signoff") || s === "x") return "secondary" as const;
  return "outline" as const;
};

export default function MobileApplicationCard({
  application,
  index,
  note,
  onNoteChange,
  readOnly = false,
  reportId,
  editStatus,
  onEditSaved,
  bulkMode = false,
  isSelected = false,
  onToggleSelect,
  isAdmin = false,
  onToggleHidden,
}: MobileApplicationCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isHidden = !!application?.hidden;

  const appKey = useMemo(
    () => `${application?.source || "BIS"}-${application?.id || application?.application_number || index}`,
    [application, index],
  );

  const jobNumber = application?.application_number || application?.job_number || "—";
  const hasEdit = !!editStatus;

  const floorApt = useMemo(() => {
    const floor = cleanValue(application?.floor);
    const apt = cleanValue(application?.apartment);
    return [floor, apt].filter(Boolean).join(" / ") || "—";
  }, [application]);

  return (
    <div className={`bg-card ${isHidden ? 'opacity-40' : ''}`}>
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
              <p className="font-mono text-sm font-medium truncate">{jobNumber}</p>
              <Badge variant={getStatusVariant(application?.status)} className="shrink-0">
                {application?.status || "—"}
              </Badge>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{application?.application_type || application?.job_type || "—"}</Badge>
              <span className="text-xs text-muted-foreground">Filed {formatDate(application?.filing_date)}</span>
              <span className="text-xs text-muted-foreground">Floor/Apt {floorApt}</span>
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

            {application?.job_description && (
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{application.job_description}</p>
            )}
          </div>
        </div>

        {isOpen && (
          <div className="mt-3 pt-3 border-t border-border space-y-3">
            {application?.job_description && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Job Description</p>
                <p className="text-sm whitespace-pre-wrap break-words">{application.job_description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Source</p>
                <p className="font-medium">{application?.source === "DOB_NOW" ? "DOB NOW Build" : "DOB BIS"}</p>
              </div>
              {application?.latest_action_date && (
                <div>
                  <p className="text-xs text-muted-foreground">Last Action</p>
                  <p className="font-medium">{formatDate(application.latest_action_date)}</p>
                </div>
              )}
              {application?.work_type && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Work Type</p>
                  <p className="font-medium break-words">{application.work_type}</p>
                </div>
              )}
            </div>

            <InlineNoteEditor
              note={note}
              onNoteChange={onNoteChange}
              reportId={reportId}
              itemType="application"
              itemIdentifier={appKey}
              agency="DOB"
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
                  const url =
                    application?.source === "DOB_NOW"
                      ? "https://a810-bisweb.nyc.gov/bisweb/bispi00.jsp"
                      : `https://a810-bisweb.nyc.gov/bisweb/JobsQueryByNumberServlet?passjobnumber=${jobNumber}`;
                  window.open(url, "_blank");
                }}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                {application?.source === "DOB_NOW" ? "Search on DOB NOW Build" : "View on DOB BIS"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
