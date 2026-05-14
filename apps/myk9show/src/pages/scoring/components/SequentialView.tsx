import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EntryPanel } from './EntryPanel';
import { sortByExhibitorOrder } from '../paper-scoring-types';
import type { ScoringEntry } from '../types';
import type { PaperResult, SessionSettings } from '../paper-scoring-types';

interface SequentialViewProps {
  entries: ScoringEntry[];
  currentIndex: number;
  settings: SessionSettings;
  onNavigate: (index: number) => void;
  onSave: (result: PaperResult, timeDigits: string, faults: number, reason?: string) => void;
  onSaveAndNext: (result: PaperResult, timeDigits: string, faults: number, reason?: string) => void;
  onClearResult?: (() => void) | undefined;
  isSaving: boolean;
}

export function SequentialView({
  entries,
  currentIndex,
  settings,
  onNavigate,
  onSave,
  onSaveAndNext,
  onClearResult,
  isSaving,
}: SequentialViewProps) {
  const sorted = useMemo(() => sortByExhibitorOrder(entries), [entries]);
  const currentEntry = sorted[currentIndex] ?? null;
  const scoredCount = useMemo(() => sorted.filter(e => e.isScored).length, [sorted]);
  const pct = sorted.length > 0 ? (scoredCount / sorted.length) * 100 : 0;

  if (!currentEntry) return null;

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {scoredCount} of {sorted.length} scored
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="prev"
              disabled={currentIndex === 0}
              onClick={() => onNavigate(currentIndex - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {currentIndex + 1} / {sorted.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="next"
              disabled={currentIndex >= sorted.length - 1}
              onClick={() => onNavigate(currentIndex + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <Card>
        <EntryPanel
          key={currentEntry.entryId}
          entry={currentEntry}
          settings={settings}
          onSave={onSave}
          onSaveAndNext={onSaveAndNext}
          onClearResult={onClearResult}
          onClose={() => {}}
          isSaving={isSaving}
        />
      </Card>
    </div>
  );
}
