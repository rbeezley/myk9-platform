import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';

import type { CockpitAttentionKind, SecretaryCockpitAttention } from './secretaryCockpitTypes';

const CHIP_TONE: Record<CockpitAttentionKind, string> = {
  blocker: 'bg-destructive/10 text-destructive',
  'active-work': 'bg-warning/10 text-warning',
  preparation: 'bg-warning/10 text-warning',
  closeout: 'bg-muted text-foreground',
  administrative: 'bg-muted text-foreground',
};

const CHIP_CLASS =
  'inline-flex min-h-9 items-center rounded-full px-3 py-1.5 text-[13px] font-semibold';

/**
 * One line of pills (layout A, owner, 2026-10-02): each names the class and
 * the problem, and opens the place to fix it. The reason is the pill's title.
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
  const visible = showAll ? all : items;

  return (
    <section
      aria-labelledby="cockpit-attention-title"
      className="flex flex-wrap items-center gap-2.5 rounded-xl border bg-card px-4 py-3"
    >
      <h2
        id="cockpit-attention-title"
        className="mr-2 flex items-center gap-2 text-sm font-semibold"
      >
        <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
        Needs attention · {all.length}
      </h2>
      {visible.map(item => {
        const className = item.classId ? classNameById.get(item.classId) : undefined;
        const text = className ? `${className} · ${item.label}` : item.label;
        const tone = cn(CHIP_CLASS, CHIP_TONE[item.kind]);
        if (!item.destination) {
          return (
            <span key={item.id} className={tone} title={item.reason}>
              {text}
            </span>
          );
        }
        if (item.destination.kind === 'href') {
          return (
            <Link
              key={item.id}
              to={item.destination.href}
              className={cn(tone, 'hover:underline')}
              title={item.reason}
            >
              {text}
            </Link>
          );
        }
        const { commandId } = item.destination;
        return (
          <button
            key={item.id}
            type="button"
            className={cn(tone, 'hover:underline')}
            title={item.reason}
            onClick={() => onCommand(commandId)}
          >
            {text}
          </button>
        );
      })}
      {overflowCount > 0 && !showAll && (
        <button
          type="button"
          className="min-h-9 text-[13px] font-semibold text-primary hover:underline"
          onClick={() => setShowAll(true)}
        >
          View {overflowCount} more issues
        </button>
      )}
    </section>
  );
}
