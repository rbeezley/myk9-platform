import { Fragment, useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';

import type { CockpitAttentionKind, SecretaryCockpitAttention } from './secretaryCockpitTypes';

const CHIP_TONE: Record<CockpitAttentionKind, string> = {
  blocker: 'bg-destructive/10 text-destructive',
  'active-work': 'bg-warning/10 text-warning',
  preparation: 'bg-warning/10 text-warning',
  // The outline keeps a grey pill visible on a dark card, where bg-muted nearly matches it.
  closeout: 'border border-border bg-muted text-foreground',
  administrative: 'border border-border bg-muted text-foreground',
};

const CHIP_CLASS =
  'inline-flex min-h-11 items-center rounded-full px-3.5 py-2 text-xs font-semibold';

/**
 * One line of pills (layout A, owner, 2026-10-02): each names the class and
 * the problem, and opens the place to fix it. The reason is the pill's title (hover) and its
 * accessible description (touch and screen readers), where a title alone is never read.
 *
 * The heading folds the pills away (MYK9-1727): on a phone each pill takes its own row, so
 * there it starts folded with the count still showing; wider screens start open.
 */
export function CockpitAttentionStrip({
  items,
  all,
  overflowCount,
  classNameById,
  onCommand,
}: {
  items: readonly SecretaryCockpitAttention[];
  all: readonly SecretaryCockpitAttention[];
  overflowCount: number;
  classNameById: ReadonlyMap<string, string>;
  onCommand: (commandId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const isPhone = useMediaQuery('(max-width: 639px)');
  const [openChoice, setOpenChoice] = useState<boolean | null>(null);
  const open = openChoice ?? !isPhone;
  const visible = showAll ? all : items;

  return (
    <section
      aria-labelledby="cockpit-attention-title"
      className="flex flex-wrap items-center gap-2.5 rounded-xl border bg-card px-4 py-3"
    >
      <h2 id="cockpit-attention-title" className="mr-2 text-sm font-semibold">
        <button
          type="button"
          className="-mx-1 flex min-h-11 items-center gap-2 rounded-md px-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={open}
          aria-controls="cockpit-attention-items"
          onClick={() => setOpenChoice(!open)}
        >
          <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
          Needs attention · {all.length}
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              !open && '-rotate-90'
            )}
            aria-hidden="true"
          />
        </button>
      </h2>
      <div id="cockpit-attention-items" className="contents">
        {open &&
          visible.map(item => {
            const className = item.classId ? classNameById.get(item.classId) : undefined;
            const text = className ? `${className} · ${item.label}` : item.label;
            const tone = cn(CHIP_CLASS, CHIP_TONE[item.kind]);
            // A reason that only repeats the pill adds nothing to read out.
            const reasonId =
              item.reason && item.reason !== text && item.reason !== item.label
                ? `cockpit-attention-reason-${item.id}`
                : undefined;
            const reasonNote = reasonId && (
              <span id={reasonId} className="sr-only">
                {item.reason}
              </span>
            );
            // MYK9-1618: the visible text stays the count; the name also says where it goes.
            const accessibleName = item.destinationName
              ? `${text}, opens ${item.destinationName}`
              : undefined;
            if (!item.destination) {
              return (
                <Fragment key={item.id}>
                  <span className={tone} title={item.reason} aria-describedby={reasonId}>
                    {text}
                  </span>
                  {reasonNote}
                </Fragment>
              );
            }
            if (item.destination.kind === 'href') {
              return (
                <Fragment key={item.id}>
                  <Link
                    to={item.destination.href}
                    className={cn(tone, 'hover:underline')}
                    title={item.reason}
                    aria-label={accessibleName}
                    aria-describedby={reasonId}
                  >
                    {text}
                  </Link>
                  {reasonNote}
                </Fragment>
              );
            }
            const { commandId } = item.destination;
            return (
              <Fragment key={item.id}>
                <button
                  type="button"
                  className={cn(tone, 'hover:underline')}
                  title={item.reason}
                  aria-label={accessibleName}
                  aria-describedby={reasonId}
                  onClick={() => onCommand(commandId)}
                >
                  {text}
                </button>
                {reasonNote}
              </Fragment>
            );
          })}
        {open && overflowCount > 0 && !showAll && (
          <button
            type="button"
            className="min-h-11 text-xs font-semibold text-primary hover:underline"
            onClick={() => setShowAll(true)}
          >
            View {overflowCount} more issues
          </button>
        )}
      </div>
    </section>
  );
}
