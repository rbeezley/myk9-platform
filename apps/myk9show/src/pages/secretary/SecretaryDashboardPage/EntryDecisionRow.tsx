import { useState } from 'react';
import { format } from 'date-fns';
import type { PendingEntry } from '@/hooks/queries/usePendingEntries';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

type Decision = 'accepted' | 'waitlist' | 'rejected';

interface EntryDecisionRowProps {
  entry: PendingEntry;
  onDecide: (entryId: string, decision: Decision) => void;
}

export function EntryDecisionRow({ entry, onDecide }: EntryDecisionRowProps) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg bg-slate-800 px-3 py-3">
        <div className="min-w-0 flex-1">
          <button
            onClick={() => setShowDetail(true)}
            className="text-left hover:underline focus:outline-none"
          >
            <p className="text-sm font-medium text-slate-100">
              {entry.handlerName} &mdash;{' '}
              <span className="font-normal text-slate-300">{entry.dogName}</span>
            </p>
          </button>
          <p className="mt-0.5 text-xs text-slate-400">
            <span>{entry.className}</span>
            {' · submitted '}
            {format(new Date(entry.submittedAt), 'MMM d')}
          </p>
        </div>
        <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
          {entry.showName}
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={() => onDecide(entry.id, 'accepted')}
            className="rounded bg-green-700 px-2.5 py-1 text-xs font-medium text-green-100 hover:bg-green-600"
          >
            Accept
          </button>
          <button
            onClick={() => onDecide(entry.id, 'waitlist')}
            className="rounded bg-amber-700 px-2.5 py-1 text-xs font-medium text-amber-100 hover:bg-amber-600"
          >
            Waitlist
          </button>
          <button
            onClick={() => onDecide(entry.id, 'rejected')}
            className="rounded bg-red-900 px-2.5 py-1 text-xs font-medium text-red-200 hover:bg-red-800"
          >
            Reject
          </button>
        </div>
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
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  onDecide(entry.id, 'accepted');
                  setShowDetail(false);
                }}
                className="rounded bg-green-700 px-3 py-1.5 text-xs font-medium text-green-100 hover:bg-green-600"
              >
                Accept
              </button>
              <button
                onClick={() => {
                  onDecide(entry.id, 'waitlist');
                  setShowDetail(false);
                }}
                className="rounded bg-amber-700 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-600"
              >
                Waitlist
              </button>
              <button
                onClick={() => {
                  onDecide(entry.id, 'rejected');
                  setShowDetail(false);
                }}
                className="rounded bg-red-900 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-800"
              >
                Reject
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
