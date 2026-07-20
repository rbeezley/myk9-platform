import { useCallback, useEffect } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  COCKPIT_PROTOTYPE_SCENARIOS,
  COCKPIT_PROTOTYPE_VARIANTS,
  type CockpitClassPrototype,
  type CockpitPrototypeVariant,
  type PaperworkPrototype,
} from './secretaryCockpitPrototypeData';

export interface PrototypePrintFlow {
  classItem: CockpitClassPrototype;
  paperwork: PaperworkPrototype;
  stage: 'report' | 'confirm';
}

export function PrototypeDestination({
  owner,
  destination,
  onBack,
}: {
  owner: string;
  destination: string;
  onBack: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
      <Button type="button" variant="ghost" className="min-h-11" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
        Back to Show Desk
      </Button>
      <section className="mt-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <Badge variant="outline">Prototype destination</Badge>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">{owner}</h1>
        <p className="mt-2 text-muted-foreground">
          The production action will open this existing owner surface with the exact Class and task
          filters already applied.
        </p>
        <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/35 p-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Exact internal destination
          </p>
          <code className="mt-2 block break-all text-sm text-foreground">{destination}</code>
        </div>
        <div className="mt-6 rounded-xl border border-success/30 bg-success/10 p-4 text-success">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Show Desk context is preserved</p>
              <p className="mt-1 text-sm">
                Back restores the selected day, filter, focused Class, and scenario in the URL.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export function ScenarioSwitcher({
  current,
  onChange,
}: {
  current: CockpitPrototypeVariant;
  onChange: (variant: CockpitPrototypeVariant) => void;
}) {
  const move = useCallback(
    (offset: number) => {
      const currentIndex = COCKPIT_PROTOTYPE_VARIANTS.indexOf(current);
      const nextIndex =
        (currentIndex + offset + COCKPIT_PROTOTYPE_VARIANTS.length) %
        COCKPIT_PROTOTYPE_VARIANTS.length;
      onChange(COCKPIT_PROTOTYPE_VARIANTS[nextIndex]!);
    },
    [current, onChange]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches('input, textarea, select, [contenteditable="true"]') ||
        (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
      ) {
        return;
      }
      event.preventDefault();
      move(event.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [move]);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-[#153e3b] p-2 text-white shadow-xl">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-11 w-11 rounded-full text-white hover:bg-white/10 hover:text-white"
        onClick={() => move(-1)}
        aria-label="Previous prototype scenario"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div className="min-w-[160px] px-2 text-center text-sm font-semibold">
        {COCKPIT_PROTOTYPE_SCENARIOS[current].label}
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-11 w-11 rounded-full text-white hover:bg-white/10 hover:text-white"
        onClick={() => move(1)}
        aria-label="Next prototype scenario"
      >
        <ArrowRight className="h-5 w-5" />
      </Button>
    </div>
  );
}

export function PrototypePrintDialog({
  flow,
  syncMode,
  onChange,
  onMarkPrinted,
}: {
  flow: PrototypePrintFlow | null;
  syncMode: 'online' | 'offline';
  onChange: (flow: PrototypePrintFlow | null) => void;
  onMarkPrinted: () => void;
}) {
  return (
    <Dialog open={Boolean(flow)} onOpenChange={open => !open && onChange(null)}>
      <DialogContent className="max-w-xl">
        {flow?.stage === 'report' ? (
          <>
            <DialogHeader>
              <DialogTitle>{flow.paperwork.label}</DialogTitle>
              <DialogDescription>
                Prototype report preview · Class scope · {flow.classItem.name}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border border-dashed border-border bg-muted/35 p-8 text-center">
              <Printer className="mx-auto h-9 w-9 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 font-semibold">Exact scoped report opens here</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Opening this preview does not claim that physical paper exists.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onChange(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="min-h-11"
                onClick={() => onChange({ ...flow, stage: 'confirm' })}
              >
                Simulate browser Print
                <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            </DialogFooter>
          </>
        ) : flow ? (
          <>
            <DialogHeader>
              <DialogTitle>Did it print?</DialogTitle>
              <DialogDescription>
                Confirm only after you have the physical {flow.paperwork.label.toLowerCase()}. This
                prototype stores the answer in memory only.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-success">
              <p className="font-semibold">{flow.classItem.name}</p>
              <p className="mt-1 text-sm">
                {syncMode === 'offline'
                  ? 'Confirmation will show as saved on this device.'
                  : 'Confirmation will show your name and current time.'}
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onChange(null)}>
                Not yet
              </Button>
              <Button type="button" className="min-h-11" onClick={onMarkPrinted}>
                <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Mark printed
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
