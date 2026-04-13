import { Card } from '@/components/ui/card';
import { ClassEntryRow } from './ClassEntryRow';
import { EntryPanel } from './EntryPanel';
import type { ScoringEntry } from '../types';
import type { PaperResult, SessionSettings } from '../paper-scoring-types';

interface SplitPanelViewProps {
  entries: ScoringEntry[];
  settings: SessionSettings;
  selectedEntryId: string | null;
  onSelectEntry: (entryId: string) => void;
  onSave: (result: PaperResult, timeDigits: string, faults: number) => void;
  onSaveAndNext: (result: PaperResult, timeDigits: string, faults: number) => void;
  isSaving: boolean;
}

export function SplitPanelView({
  entries,
  settings,
  selectedEntryId,
  onSelectEntry,
  onSave,
  onSaveAndNext,
  isSaving,
}: SplitPanelViewProps) {
  const sorted = [...entries].sort((a, b) => a.exhibitorOrder - b.exhibitorOrder);
  const selectedEntry = sorted.find(e => e.entryId === selectedEntryId) ?? null;

  return (
    <div className="flex gap-4 h-full">
      {/* Left: entry list */}
      <Card className="flex-1 overflow-y-auto p-2 space-y-1">
        {sorted.map(entry => (
          <ClassEntryRow
            key={entry.entryId}
            entry={entry}
            isActive={entry.entryId === selectedEntryId}
            onClick={() => onSelectEntry(entry.entryId)}
          />
        ))}
      </Card>

      {/* Right: entry panel */}
      {selectedEntry && (
        <Card className="w-80 shrink-0 overflow-y-auto" key={selectedEntry.entryId}>
          <EntryPanel
            entry={selectedEntry}
            settings={settings}
            onSave={onSave}
            onSaveAndNext={onSaveAndNext}
            onClose={() => onSelectEntry('')}
            isSaving={isSaving}
          />
        </Card>
      )}
    </div>
  );
}
