import { useState } from 'react';
import { format } from 'date-fns';
import type { PendingEntry } from '@/hooks/queries/usePendingEntries';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

type Decision = 'accepted' | 'waitlist' | 'rejected';

interface EntryDecisionRowProps {
  entry: PendingEntry;
  onDecide: (entryId: string, decision: Decision) => void;
}

const DECISIONS: {
  value: Decision;
  label: string;
  variant: 'success' | 'warning' | 'destructive';
}[] = [
  { value: 'accepted', label: 'Accept', variant: 'success' },
  { value: 'waitlist', label: 'Waitlist', variant: 'warning' },
  { value: 'rejected', label: 'Reject', variant: 'destructive' },
];

interface DecisionButtonsProps {
  entryId: string;
  onDecide: (entryId: string, decision: Decision) => void;
  onAfter?: () => void;
}

function DecisionButtons({ entryId, onDecide, onAfter }: DecisionButtonsProps) {
  return (
    <div className="flex gap-1.5">
      {DECISIONS.map(({ value, label, variant }) => (
        <Button
          key={value}
          variant={variant}
          size="sm"
          onClick={() => {
            onDecide(entryId, value);
            onAfter?.();
          }}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

export function EntryDecisionRow({ entry, onDecide }: EntryDecisionRowProps) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3">
        <div className="min-w-0 flex-1">
          <button
            onClick={() => setShowDetail(true)}
            className="text-left hover:underline focus:outline-none"
          >
            <p className="text-sm font-medium text-foreground">
              {entry.handlerName} &mdash;{' '}
              <span className="font-normal text-muted-foreground">{entry.dogName}</span>
            </p>
          </button>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span>{entry.className}</span>
            {' · submitted '}
            {format(new Date(entry.submittedAt), 'MMM d')}
          </p>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {entry.showName}
        </span>
        <DecisionButtons entryId={entry.id} onDecide={onDecide} />
      </div>

      <Sheet open={showDetail} onOpenChange={setShowDetail}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Entry Detail</SheetTitle>
          </SheetHeader>
          <div className="mt-6 flex flex-col gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Handler
              </p>
              <p className="mt-0.5 text-sm">{entry.handlerName}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Dog
              </p>
              <p className="mt-0.5 text-sm">{entry.dogName}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Class
              </p>
              <p className="mt-0.5 text-sm">{entry.className}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Show
              </p>
              <p className="mt-0.5 text-sm">{entry.showName}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Submitted
              </p>
              <p className="mt-0.5 text-sm">
                {format(new Date(entry.submittedAt), 'MMM d, yyyy h:mm a')}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Status
              </p>
              <p className="mt-0.5 text-sm capitalize">Pending</p>
            </div>
            <div className="pt-2">
              <DecisionButtons
                entryId={entry.id}
                onDecide={onDecide}
                onAfter={() => setShowDetail(false)}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
