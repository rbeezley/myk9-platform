import { useState } from 'react';
import { ClipboardCheck, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RunSheetResult } from './types';

interface ResultEntryFormProps {
  dogName: string;
  timeLimit: string;
  initial: RunSheetResult | null;
  onCancel: () => void;
  onSave: (result: RunSheetResult) => void;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
      {children}
    </p>
  );
}

export function ResultEntryForm({
  dogName,
  timeLimit,
  initial,
  onCancel,
  onSave,
}: ResultEntryFormProps) {
  const [qualified, setQualified] = useState<boolean>(initial?.qualified ?? true);
  const [timeStr, setTimeStr] = useState(initial?.timeStr ?? '');
  const [faults, setFaults] = useState(initial?.faults ?? 0);
  const [placement, setPlacement] = useState<number | null>(initial?.placement ?? null);
  const [judgeNotes, setJudgeNotes] = useState(initial?.judgeNotes ?? '');

  return (
    <div className="border-t border-border bg-muted/20 px-6 py-5">
      <div className="flex items-center gap-2.5 mb-4">
        <ClipboardCheck size={20} className="text-muted-foreground" />
        <span className="font-serif text-xl font-medium">Enter result for {dogName}</span>
        <span className="text-sm text-muted-foreground">· Limit {timeLimit}</span>
      </div>

      <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: '1.2fr 1fr 1fr 1fr' }}>
        {/* Q / NQ toggle */}
        <div>
          <FieldLabel>Result</FieldLabel>
          <div className="flex gap-2">
            <button
              onClick={() => setQualified(true)}
              className={cn(
                'flex-1 h-12 flex items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors',
                qualified
                  ? 'bg-green-600 border-green-600 text-white'
                  : 'bg-background border-border text-muted-foreground hover:border-green-400'
              )}
            >
              <CheckCircle2 size={16} /> Qualified
            </button>
            <button
              onClick={() => setQualified(false)}
              className={cn(
                'flex-1 h-12 flex items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors',
                !qualified
                  ? 'bg-red-600 border-red-600 text-white'
                  : 'bg-background border-border text-muted-foreground hover:border-red-400'
              )}
            >
              <XCircle size={16} /> NQ
            </button>
          </div>
        </div>

        {/* Time input */}
        <div>
          <FieldLabel>Search time</FieldLabel>
          <input
            type="text"
            value={timeStr}
            onChange={e => setTimeStr(e.target.value)}
            placeholder="0:00.00"
            className="w-full h-12 px-4 text-2xl font-mono font-bold rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Faults stepper */}
        <div>
          <FieldLabel>Faults</FieldLabel>
          <div className="flex h-12 rounded-xl border border-border bg-background overflow-hidden">
            <button
              onClick={() => setFaults(f => Math.max(0, f - 1))}
              className="w-12 flex items-center justify-center text-xl font-bold text-muted-foreground hover:bg-muted transition-colors"
            >
              −
            </button>
            <span className="flex-1 flex items-center justify-center text-xl font-mono font-bold">
              {faults}
            </span>
            <button
              onClick={() => setFaults(f => f + 1)}
              className="w-12 flex items-center justify-center text-xl font-bold text-muted-foreground hover:bg-muted transition-colors"
            >
              +
            </button>
          </div>
        </div>

        {/* Placement pills */}
        <div>
          <FieldLabel>Placement</FieldLabel>
          <div className="flex gap-1 h-12">
            {([null, 1, 2, 3, 4] as Array<number | null>).map((p, i) => (
              <button
                key={i}
                onClick={() => setPlacement(p)}
                className={cn(
                  'flex-1 rounded-xl border text-sm font-mono font-bold transition-colors',
                  placement === p
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border text-muted-foreground hover:border-primary/40'
                )}
              >
                {p === null ? '–' : p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="mb-4">
        <FieldLabel>
          Notes{' '}
          <span className="normal-case tracking-normal font-normal text-muted-foreground">
            (optional)
          </span>
        </FieldLabel>
        <textarea
          value={judgeNotes}
          onChange={e => setJudgeNotes(e.target.value)}
          placeholder="e.g. Handler needed second cue, dog found container #3 correctly."
          rows={2}
          className="w-full px-4 py-3 text-sm rounded-xl border border-border bg-background resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => onSave({ qualified, timeStr, faults, placement, judgeNotes })}
        >
          Save result
        </Button>
      </div>
    </div>
  );
}
