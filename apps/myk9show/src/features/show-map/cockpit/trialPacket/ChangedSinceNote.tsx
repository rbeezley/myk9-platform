import { Button } from '@/components/ui/button';

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
  const { status, onlyNeed, emptyView, changedCount, unprintedCount, shownCount, chooseOnlyNeed } =
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
  // On every class, a note only when some classes need printing and she could narrow to them.
  if (!onlyNeed && (need === 0 || need === status.total)) return null;
  const both = changedCount > 0 && unprintedCount > 0;
  const text = onlyNeed
    ? shownCount > need
      ? `Only the ${plural(shownCount, 'class', 'classes')} that needed printing.`
      : both
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
