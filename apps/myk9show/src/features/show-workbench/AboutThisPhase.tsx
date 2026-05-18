import { useState } from 'react';
import { Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ShowWorkbenchPhase } from '@/hooks/useActivePhase';

interface AboutThisPhaseProps {
  phase: ShowWorkbenchPhase;
  showId: string;
}

interface PhaseAboutCopy {
  title: string;
  body: string;
}

const PHASE_ABOUT_COPY: Record<ShowWorkbenchPhase, PhaseAboutCopy> = {
  setup: {
    title: 'About Setup',
    body: 'Use this before the first dog runs: confirm the schedule, judges, show page, and materials so the morning starts cleanly.',
  },
  today: {
    title: 'About Today',
    body: 'Use this during the show: keep rings moving, handle attention items, and open MyK9Q when ringside needs access.',
  },
  'wrap-up': {
    title: 'About Wrap-up',
    body: 'Use this after judging: review results, print reports, and submit final files once the show is ready to close.',
  },
};

function storageKey(showId: string, phase: ShowWorkbenchPhase): string {
  return `myk9show:workbench-about-dismissed:${showId}:${phase}`;
}

function readDismissed(showId: string, phase: ShowWorkbenchPhase): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(storageKey(showId, phase)) === 'true';
}

function writeDismissed(showId: string, phase: ShowWorkbenchPhase) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(showId, phase), 'true');
}

export function AboutThisPhase({ phase, showId }: AboutThisPhaseProps) {
  const key = storageKey(showId, phase);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(() =>
    readDismissed(showId, phase) ? new Set([key]) : new Set()
  );
  const copy = PHASE_ABOUT_COPY[phase];
  const dismissed = dismissedKeys.has(key) || readDismissed(showId, phase);

  if (dismissed) return null;

  function handleDismiss() {
    writeDismissed(showId, phase);
    setDismissedKeys(current => new Set(current).add(key));
  }

  return (
    <section
      className="flex items-start gap-3 rounded-md border bg-muted/35 px-4 py-3 text-sm"
      aria-labelledby={`${phase}-about-title`}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h3 id={`${phase}-about-title`} className="font-medium text-foreground">
          {copy.title}
        </h3>
        <p className="mt-1 text-muted-foreground">{copy.body}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="-mr-2 -mt-1 h-8 w-8 shrink-0"
        onClick={handleDismiss}
      >
        <X className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">Dismiss {copy.title}</span>
      </Button>
    </section>
  );
}
