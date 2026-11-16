import { Button } from '@/components/ui/button';

import type { PacketPrintStatus } from './changedClasses';
import type { ChangedPacket } from './useChangedPacket';
import { plural } from './usePacketFrame';

const NOTE_CLASS = 'rounded-md border bg-muted/40 px-3 text-sm';

/** Why the classes needing print are what they are: "2 changed since printing, 1 not printed yet". */
function reasons(changed: number, unprinted: number): string {
  return [
    changed > 0 ? `${changed} changed since printing` : null,
    unprinted > 0 ? `${unprinted} not printed yet` : null,
  ]
    .filter(Boolean)
    .join(', ');
}

/** The line above the packets: which classes they hold, and the way back to all of them. */
export function ChangedSinceNote({ view }: { view: ChangedPacket }) {
  const { status, onlyNeed, emptyView, pinned, changedCount, unprintedCount, chooseOnlyNeed } =
    view;
  if (!status || status.kind === 'loading') return null;
  if (status.kind === 'unknown') {
    return (
      <p role="status" className={`${NOTE_CLASS} py-2`}>
        Could not check which classes changed since printing, so every class is shown.
      </p>
    );
  }
  if (emptyView) {
    return (
      <p role="status" className={`${NOTE_CLASS} flex flex-wrap items-center py-1`}>
        Everything in this trial is printed and unchanged.
        <Button
          type="button"
          variant="link"
          className="min-h-11 px-1"
          onClick={() => chooseOnlyNeed(false)}
        >
          Print every class instead
        </Button>
      </p>
    );
  }
  const need = changedCount + unprintedCount;
  if (!onlyNeed && need === 0) return null;
  if (!onlyNeed && !view.narrowable) return null;
  const both = changedCount > 0 && unprintedCount > 0;
  const text = pinned
    ? `Only the ${plural(view.packet?.judges.reduce((sum, item) => sum + item.classes.length, 0) ?? 0, 'class', 'classes')} that needed printing.`
    : onlyNeed
      ? both
        ? `Only the ${plural(need, 'class', 'classes')} that need printing: ${reasons(changedCount, unprintedCount)}.`
        : changedCount > 0
          ? `Only the ${plural(changedCount, 'class', 'classes')} that changed since printing.`
          : `Only the ${plural(unprintedCount, 'class', 'classes')} not printed yet.`
      : `${plural(need, 'class', 'classes')} ${need === 1 ? 'needs' : 'need'} printing: ${reasons(changedCount, unprintedCount)}.`;
  return (
    <p role="status" className={`${NOTE_CLASS} flex flex-wrap items-center py-1`}>
      {text}
      <Button
        type="button"
        variant="link"
        className="min-h-11 px-1"
        onClick={() => chooseOnlyNeed(!onlyNeed)}
      >
        {onlyNeed ? 'Show all classes' : 'Show only what needs printing'}
      </Button>
    </p>
  );
}

/** A class that was printed, then lost its only dogs: there is nothing left to reprint for it. */
export function ChangedEmptyNote({ status }: { status: PacketPrintStatus | null }) {
  if (status?.kind !== 'known' || status.changedEmptyCount === 0) return null;
  const count = status.changedEmptyCount;
  return (
    <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      {plural(count, 'class', 'classes')} changed since printing and now{' '}
      {count === 1 ? 'has' : 'have'} no dogs, so there is nothing to reprint for{' '}
      {count === 1 ? 'it' : 'them'}.
    </p>
  );
}
