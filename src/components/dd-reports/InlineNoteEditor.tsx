import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, X, Check, Loader2 } from 'lucide-react';

const ERROR_CATEGORIES = [
  { value: 'too_vague', label: 'Too Vague — generic language without specifics' },
  { value: 'wrong_severity', label: 'Wrong Severity — misclassified action level' },
  { value: 'missing_context', label: 'Missing Context — didn\'t connect to customer concern' },
  { value: 'stale_treated_as_active', label: 'Stale as Active — wrote about resolved item' },
  { value: 'wrong_agency_explanation', label: 'Wrong Agency Explanation — misunderstood violation' },
  { value: 'missing_note', label: 'Missing Note — no note where one was needed' },
  { value: 'factual_error', label: 'Factual Error — incorrect statement' },
  { value: 'tone_style', label: 'Tone/Style — unprofessional or alarmist wording' },
  { value: 'knowledge_gap', label: 'Knowledge Gap — lacked domain knowledge' },
  { value: 'other', label: 'Other' },
] as const;

interface EditStatus {
  status: 'pending' | 'approved' | 'rejected';
  id: string;
}

interface InlineNoteEditorProps {
  note: string;
  onNoteChange: (note: string) => void;
  reportId: string;
  itemType: 'violation' | 'application' | 'complaint';
  itemIdentifier: string;
  agency: string;
  readOnly?: boolean;
  editStatus?: EditStatus | null;
  onEditSaved?: (editId: string) => void;
}

const InlineNoteEditor = ({
  note,
  onNoteChange,
  reportId,
  itemType,
  itemIdentifier,
  agency,
  readOnly = false,
  editStatus,
  onEditSaved,
}: InlineNoteEditorProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedNote, setEditedNote] = useState(note);
  const [errorCategory, setErrorCategory] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Sync editedNote when note prop changes externally
  useEffect(() => {
    if (!isEditing) setEditedNote(note);
  }, [note, isEditing]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditedNote(note);
    setErrorCategory('');
    setIsEditing(true);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditedNote(note);
    setErrorCategory('');
    setIsEditing(false);
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!errorCategory) {
      toast.error('Please select a reason for the change');
      return;
    }
    if (editedNote.trim() === note.trim()) {
      toast.info('No changes detected');
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        toast.error('You must be logged in');
        return;
      }

      const { data, error } = await supabase
        .from('report_edits')
        .insert({
          report_id: reportId,
          item_type: itemType,
          item_identifier: itemIdentifier,
          agency,
          original_note: note || null,
          edited_note: editedNote.trim(),
          error_category: errorCategory,
          editor_id: userData.user.id,
          status: 'pending',
        } as any)
        .select('id')
        .single();

      if (error) throw error;

      // Update the note immediately in the UI
      onNoteChange(editedNote.trim());
      onEditSaved?.(data.id);
      setIsEditing(false);
      toast.success('Edit saved — pending admin review');
    } catch (err) {
      console.error('Failed to save edit:', err);
      toast.error('Failed to save edit');
    } finally {
      setIsSaving(false);
    }
  };

  const statusBadge = editStatus ? (
    <Badge
      variant="outline"
      className={
        editStatus.status === 'approved'
          ? 'text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
          : editStatus.status === 'pending'
          ? 'text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600 border-amber-500/30'
          : 'text-[10px] px-1.5 py-0 bg-red-500/10 text-red-600 border-red-500/30'
      }
    >
      {editStatus.status === 'approved' ? '✓ Approved' : editStatus.status === 'pending' ? '⏳ Pending Review' : '✗ Rejected'}
    </Badge>
  ) : null;

  if (readOnly) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-muted-foreground">Notes</p>
          {statusBadge}
        </div>
        <p className="text-sm text-foreground/80 whitespace-pre-wrap">{note || <span className="italic text-muted-foreground">No note</span>}</p>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="space-y-3" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-muted-foreground">Edit Note</p>
          {statusBadge}
        </div>
        <Textarea
          value={editedNote}
          onChange={(e) => setEditedNote(e.target.value)}
          rows={3}
          className="resize-none text-sm"
          placeholder="Write your corrected note..."
          autoFocus
        />
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Why was this changed? <span className="text-destructive">*</span></label>
          <Select value={errorCategory} onValueChange={setErrorCategory}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select reason for correction..." />
            </SelectTrigger>
            <SelectContent>
              {ERROR_CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value} className="text-xs">
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={isSaving || !errorCategory} className="h-7 text-xs">
            {isSaving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
            Save Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={handleCancel} disabled={isSaving} className="h-7 text-xs">
            <X className="w-3 h-3 mr-1" /> Cancel
          </Button>
        </div>
      </div>
    );
  }

  // View mode with pencil icon
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-muted-foreground">Notes</p>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleStartEdit} title="Edit this note">
          <Pencil className="w-3 h-3" />
        </Button>
        {statusBadge}
      </div>
      {note ? (
        <p className="text-sm text-foreground/80 whitespace-pre-wrap">{note}</p>
      ) : (
        <Textarea
          placeholder="Add notes..."
          value=""
          onChange={(e) => onNoteChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onFocus={(e) => e.stopPropagation()}
          rows={2}
          className="resize-none"
        />
      )}
    </div>
  );
};

export default InlineNoteEditor;
