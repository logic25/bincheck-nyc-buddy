import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, X, CheckCheck } from 'lucide-react';

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

export interface SelectedItem {
  itemType: 'violation' | 'application' | 'complaint';
  itemIdentifier: string;
  agency: string;
  currentNote: string;
}

interface BatchEditPanelProps {
  selectedItems: SelectedItem[];
  reportId: string;
  onClose: () => void;
  onBatchSaved: (editIds: string[]) => void;
}

const BatchEditPanel = ({ selectedItems, reportId, onClose, onBatchSaved }: BatchEditPanelProps) => {
  const [errorCategory, setErrorCategory] = useState<string>('');
  const [batchNote, setBatchNote] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [mode, setMode] = useState<'classify' | 'rewrite'>('classify');

  const handleBatchSave = async () => {
    if (!errorCategory) {
      toast.error('Please select an error category');
      return;
    }

    setIsSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        toast.error('You must be logged in');
        return;
      }

      const batchId = crypto.randomUUID();

      const rows = selectedItems.map((item) => ({
        report_id: reportId,
        item_type: item.itemType,
        item_identifier: item.itemIdentifier,
        agency: item.agency,
        original_note: item.currentNote || null,
        edited_note: mode === 'rewrite' && batchNote.trim()
          ? batchNote.trim()
          : item.currentNote || '',
        error_category: errorCategory,
        editor_id: userData.user.id,
        status: 'pending',
        batch_id: batchId,
      }));

      const { data, error } = await supabase
        .from('report_edits')
        .insert(rows as any)
        .select('id');

      if (error) throw error;

      const editIds = (data || []).map((d: any) => d.id);
      onBatchSaved(editIds);
      toast.success(`${selectedItems.length} edits saved — pending admin review`);
    } catch (err) {
      console.error('Batch save failed:', err);
      toast.error('Failed to save batch edits');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card shadow-lg">
      <div className="max-w-5xl mx-auto p-4">
        <div className="flex items-start gap-4">
          {/* Left: selection info */}
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="text-sm px-3 py-1">
                {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} selected
              </Badge>
              <div className="flex gap-1">
                <Button
                  variant={mode === 'classify' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setMode('classify')}
                >
                  Classify Only
                </Button>
                <Button
                  variant={mode === 'rewrite' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setMode('rewrite')}
                >
                  Rewrite All
                </Button>
              </div>
            </div>

            <div className="flex items-end gap-3">
              <div className="w-72">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Error Category <span className="text-destructive">*</span>
                </label>
                <Select value={errorCategory} onValueChange={setErrorCategory}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select reason..." />
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

              {mode === 'rewrite' && (
                <div className="flex-1">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Replacement note (applied to all selected)
                  </label>
                  <Textarea
                    value={batchNote}
                    onChange={(e) => setBatchNote(e.target.value)}
                    rows={2}
                    className="resize-none text-sm"
                    placeholder="Write the corrected note..."
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={handleBatchSave}
              disabled={isSaving || !errorCategory || (mode === 'rewrite' && !batchNote.trim())}
              className="h-8"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5 mr-1.5" />}
              Save {selectedItems.length} Edit{selectedItems.length !== 1 ? 's' : ''}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BatchEditPanel;
