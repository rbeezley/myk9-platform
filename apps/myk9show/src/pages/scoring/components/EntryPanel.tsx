import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TimeInput } from '@/components/ui/data-table';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { cn } from '@/lib/utils';
import type { ScoringEntry } from '../types';
import type { PaperResult, SessionSettings } from '../paper-scoring-types';

interface EntryPanelProps {
  entry: ScoringEntry;
  settings: SessionSettings;
  onSave: (result: PaperResult, timeDigits: string, faults: number) => void;
  onSaveAndNext: (result: PaperResult, timeDigits: string, faults: number) => void;
  onClose: () => void;
  isSaving: boolean;
}

const RESULT_BUTTONS: { code: PaperResult; label: string; description: string }[] = [
  { code: 'Q', label: 'Q', description: 'Qualified' },
  { code: 'NQ', label: 'NQ', description: 'Not Qualified' },
  { code: 'ABS', label: 'ABS', description: 'Absent' },
  { code: 'EX', label: 'EX', description: 'Excused' },
];

/** True when selecting this result should immediately auto-save (no time needed) */
function shouldAutoSave(result: PaperResult, settings: SessionSettings): boolean {
  return result !== 'Q' && settings.timeRecordMode === 'q-only' && settings.preFill === 'none';
}

/** True when the time field should be shown given a selected result */
function showTimeField(result: PaperResult | null, settings: SessionSettings): boolean {
  if (result === null) return false;
  if (result === 'Q') return true;
  return settings.timeRecordMode === 'all-runs';
}

export function EntryPanel({
  entry,
  settings,
  onSave,
  onSaveAndNext,
  onClose,
  isSaving,
}: EntryPanelProps) {
  const initialResult: PaperResult | null = settings.preFill === 'none' ? null : settings.preFill;

  const [selectedResult, setSelectedResult] = useState<PaperResult | null>(initialResult);
  const [timeDigits, setTimeDigits] = useState('');
  const [faults, setFaults] = useState(0);

  const handleResultClick = (result: PaperResult) => {
    setSelectedResult(result);
    if (shouldAutoSave(result, settings)) {
      onSave(result, '', 0);
    }
  };

  const isPreFilled = (result: PaperResult) =>
    settings.preFill !== 'none' && result === settings.preFill;

  const showSaveButtons = selectedResult !== null && !shouldAutoSave(selectedResult, settings);

  const displayTimeField = showTimeField(selectedResult, settings);

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      {/* Dog info */}
      <div className="flex items-center gap-3">
        <ArmbandBadge armband={entry.armband} />
        <div>
          <div className="font-semibold">{entry.callName}</div>
          <div className="text-sm text-muted-foreground">{entry.handler}</div>
        </div>
      </div>

      {/* Result buttons */}
      <div className="space-y-1">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Result
        </div>
        <div className="flex flex-col gap-2">
          {RESULT_BUTTONS.map(({ code, label, description }) => {
            const isSelected = selectedResult === code;
            const isPrefilled = isPreFilled(code);
            return (
              <button
                key={code}
                aria-label={label}
                onClick={() => handleResultClick(code)}
                data-prefilled={isPrefilled ? 'true' : undefined}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left transition-colors font-semibold',
                  isSelected && !isPrefilled && 'border-primary bg-primary text-primary-foreground',
                  isPrefilled && 'border-dashed border-primary bg-primary/10',
                  !isSelected && !isPrefilled && 'border-border hover:bg-accent'
                )}
              >
                <span className="text-lg w-10">{label}</span>
                <span className="text-sm font-normal opacity-80">{description}</span>
                {isPrefilled && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    pre-filled · click to confirm
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time field — conditional */}
      {displayTimeField && (
        <div className="space-y-1">
          <label
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
            htmlFor="time-input"
          >
            Search Time
            {selectedResult !== 'Q' && (
              <span className="ml-1 text-muted-foreground/60 normal-case">(optional)</span>
            )}
          </label>
          <TimeInput
            id="time-input"
            value={timeDigits}
            onChange={setTimeDigits}
            onCommit={() => {}}
            onCancel={() => setTimeDigits('')}
            autoFocus
            className="h-12 text-xl text-center font-mono rounded-lg border-2 focus:border-primary"
          />
        </div>
      )}

      {/* Faults — only for Q */}
      {selectedResult === 'Q' && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Faults <span className="normal-case text-muted-foreground/60">(optional)</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setFaults(f => Math.max(0, f - 1))}
              disabled={faults === 0}
            >
              −
            </Button>
            <span className="w-8 text-center font-semibold text-lg">{faults}</span>
            <Button variant="outline" size="icon" onClick={() => setFaults(f => f + 1)}>
              +
            </Button>
          </div>
        </div>
      )}

      {/* Save buttons */}
      {showSaveButtons && (
        <div className="flex gap-2 mt-auto pt-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => onSave(selectedResult!, timeDigits, faults)}
            disabled={isSaving}
          >
            Save
          </Button>
          <Button
            className="flex-1"
            onClick={() => onSaveAndNext(selectedResult!, timeDigits, faults)}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save & Next'}
          </Button>
        </div>
      )}

      {/* Close / cancel */}
      <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
        Cancel
      </Button>
    </div>
  );
}
