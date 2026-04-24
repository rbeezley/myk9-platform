import {
  GripVertical,
  ClipboardCheck,
  Pencil,
  X,
  RotateCcw,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/base/Chip';
import { PersonAvatar } from '@/components/common/PersonAvatar';
import { cn } from '@/lib/utils';
import { ResultEntryForm } from './ResultEntryForm';
import type { RunSheetEntry, RunSheetResult } from './types';

const PLACEMENT_LABELS = ['1st', '2nd', '3rd', '4th'];
const PLACEMENT_COLORS = ['#f59e0b', '#9ca3af', '#d97706', '#6366f1'];

interface RunSheetRowProps {
  entry: RunSheetEntry;
  position: number;
  expanded: boolean;
  timeLimit: string;
  onToggleExpand: () => void;
  onCheckIn: (checked: boolean) => void;
  onScratch: (scratched: boolean) => void;
  onSaveResult: (result: RunSheetResult) => void;
}

export function RunSheetRow({
  entry,
  position,
  expanded,
  timeLimit,
  onToggleExpand,
  onCheckIn,
  onScratch,
  onSaveResult,
}: RunSheetRowProps) {
  const { isScored, isScratched, isCheckedIn, result } = entry;

  return (
    <div
      className={cn(
        'rounded-2xl border bg-card overflow-hidden transition-opacity',
        isScored && 'border-green-200',
        isScratched && 'border-red-200 opacity-60',
        !isScored && !isScratched && 'border-border'
      )}
    >
      <div
        className="grid items-center gap-4 px-4 py-3.5"
        style={{ gridTemplateColumns: '24px 44px 44px 1fr auto auto' }}
      >
        <GripVertical
          size={18}
          className="text-muted-foreground/25 cursor-not-allowed"
          aria-hidden
        />

        <div
          className={cn(
            'w-11 h-11 rounded-xl flex items-center justify-center font-mono text-lg font-bold',
            isScored ? 'bg-green-50 text-green-700' : 'bg-muted text-foreground'
          )}
        >
          {isScratched ? '–' : position}
        </div>

        <PersonAvatar name={entry.dogName} size="sm" className="h-11 w-11" />

        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-base font-bold text-foreground">{entry.dogName}</span>
            {entry.breed && <span className="text-xs text-muted-foreground">{entry.breed}</span>}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
            <span className="font-mono font-semibold">#{entry.armband}</span>
            {entry.ownerName && (
              <>
                <span>·</span>
                <span>{entry.ownerName}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isScored && result && (
            <>
              <Chip
                color={result.qualified ? 'green' : 'red'}
                size="sm"
                leadingIcon={result.qualified ? <CheckCircle2 size={12} /> : <X size={12} />}
              >
                {result.qualified ? 'Qualified' : 'NQ'}
              </Chip>
              {result.timeStr && (
                <span className="font-mono text-sm font-bold text-foreground">
                  {result.timeStr}
                </span>
              )}
              {result.placement && (
                <span
                  className="text-xs font-bold font-mono px-2 py-0.5 rounded-full text-white"
                  style={{ background: PLACEMENT_COLORS[result.placement - 1] }}
                >
                  {PLACEMENT_LABELS[result.placement - 1]}
                </span>
              )}
            </>
          )}
          {isScratched && (
            <Chip color="red" size="sm">
              Scratched
            </Chip>
          )}
          {!isScored && !isScratched && (
            <button
              onClick={() => onCheckIn(!isCheckedIn)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-semibold transition-colors',
                isCheckedIn
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : 'bg-background border-border text-muted-foreground hover:border-green-400'
              )}
            >
              {isCheckedIn ? (
                <>
                  <CheckCircle2 size={15} /> Checked in
                </>
              ) : (
                <>
                  <Circle size={15} /> Check in
                </>
              )}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isScratched && (
            <Button
              size="sm"
              variant={isScored ? 'outline' : 'default'}
              onClick={onToggleExpand}
              className="gap-1.5"
            >
              {isScored ? (
                <>
                  <Pencil size={13} /> Edit result
                </>
              ) : (
                <>
                  <ClipboardCheck size={13} /> Enter result
                </>
              )}
            </Button>
          )}
          <button
            onClick={() => onScratch(!isScratched)}
            title={isScratched ? 'Unscratch' : 'Scratch entry'}
            aria-label={isScratched ? 'Unscratch entry' : 'Scratch entry'}
            className="w-9 h-9 rounded-lg border border-border bg-background flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
          >
            {isScratched ? <RotateCcw size={15} /> : <X size={15} />}
          </button>
        </div>
      </div>

      {expanded && !isScratched && (
        <ResultEntryForm
          dogName={entry.dogName}
          timeLimit={timeLimit}
          initial={entry.result}
          onCancel={onToggleExpand}
          onSave={r => {
            onSaveResult(r);
            onToggleExpand();
          }}
        />
      )}
    </div>
  );
}
