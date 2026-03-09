import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight } from "lucide-react";
import { decodeComplaintCategory } from "@/lib/complaint-category-decoder";
import InlineNoteEditor from "../InlineNoteEditor";

interface EditStatus {
  status: "pending" | "approved" | "rejected";
  id: string;
}

interface MobileComplaintCardProps {
  complaint: any;
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

export default function MobileComplaintCard({
  complaint,
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
}: MobileComplaintCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  const complaintId = useMemo(
    () => complaint?.complaint_number || String(index),
    [complaint, index],
  );

  const statusLower = (complaint?.status || "").toLowerCase();
  const isClosed = statusLower === "closed" || statusLower === "close";
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
        <div className={`flex items-start gap-2 ${isClosed ? "opacity-70" : ""}`}>
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
              <p className="font-mono text-sm font-medium truncate">{complaintId}</p>
              <Badge variant={isClosed ? "secondary" : "destructive"} className="shrink-0">
                {complaint?.status || "Unknown"}
              </Badge>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Entered {formatDate(complaint?.date_entered)}</span>
              {complaint?.unit && <span className="text-xs text-muted-foreground">Unit {complaint.unit}</span>}
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

            {complaint?.complaint_category && (
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                {decodeComplaintCategory(complaint.complaint_category)}
              </p>
            )}
          </div>
        </div>

        {isOpen && (
          <div className="mt-3 pt-3 border-t border-border space-y-3">
            {complaint?.description && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                <p className="text-sm whitespace-pre-wrap break-words">{complaint.description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Category</p>
                <p className="font-medium break-words">
                  {decodeComplaintCategory(complaint?.complaint_category) || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Code</p>
                <p className="font-medium font-mono">{complaint?.complaint_category || "—"}</p>
              </div>
              {complaint?.disposition_date && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Disposition</p>
                  <p className="font-medium">{formatDate(complaint.disposition_date)}</p>
                </div>
              )}
            </div>

            <InlineNoteEditor
              note={note}
              onNoteChange={onNoteChange}
              reportId={reportId}
              itemType="complaint"
              itemIdentifier={complaintId}
              agency="DOB"
              readOnly={readOnly}
              editStatus={editStatus}
              onEditSaved={onEditSaved}
            />
          </div>
        )}
      </div>
    </div>
  );
}
