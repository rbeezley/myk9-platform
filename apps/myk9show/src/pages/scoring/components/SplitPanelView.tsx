import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { ClassEntryRow } from './ClassEntryRow';
import { EntryPanel } from './EntryPanel';
import { sortByExhibitorOrder } from '../paper-scoring-types';
import type { ScoringEntry } from '../types';
import type { PaperResult, SessionSettings } from '../paper-scoring-types';

interface SplitPanelViewProps {
  entries: ScoringEntry[];
  settings: SessionSettings;
  selectedEntryId: string | null;
  onSelectEntry: (entryId: string | null) => void;
  onSave: (result: PaperResult, timeDigits: string, faults: number, reason?: string) => void;
  onSaveAndNext: (result: PaperResult, timeDigits: string, faults: number, reason?: string) => void;
  onClearResult?: (() => void) | undefined;
  isSaving: boolean;
}

export function SplitPanelView({
  entries,
  settings,
  selectedEntryId,
  onSelectEntry,
  onSave,
  onSaveAndNext,
  onClearResult,
  isSaving,
}: SplitPanelViewProps) {
  const sorted = useMemo(() => sortByExhibitorOrder(entries), [entries]);
  const selectedEntry = sorted.find(e => e.entryId === selectedEntryId) ?? null;
  const allEntriesScored = sorted.length > 0 && sorted.every(entry => entry.isScored);

  return (
    <div className="flex gap-4 h-full">
      <Card className="flex-1 overflow-y-auto p-2 space-y-1">
        {sorted.map(entry => (
          <ClassEntryRow
            key={entry.entryId}
            entry={entry}
            isActive={entry.entryId === selectedEntryId}
            showPlacement={allEntriesScored}
            onClick={() => onSelectEntry(entry.entryId)}
          />
        ))}
      </Card>

      {selectedEntry && (
        <Card className="w-80 shrink-0 overflow-y-auto" key={selectedEntry.entryId}>
          <EntryPanel
            entry={selectedEntry}
            settings={settings}
            onSave={onSave}
            onSaveAndNext={onSaveAndNext}
            onClearResult={onClearResult}
            onClose={() => onSelectEntry(null)}
            isSaving={isSaving}
          />
        </Card>
      )}
    </div>
  );
}
