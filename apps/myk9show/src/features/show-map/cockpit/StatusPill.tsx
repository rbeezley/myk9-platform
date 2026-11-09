import { cn } from '@/lib/utils';

import type { ShowMapStatusKind } from '../showMapTypes';

// Same tokens the rest of the app uses for done / live / waiting / out, so a status reads alike.
const KIND_CLASS: Record<ShowMapStatusKind, string> = {
  complete: 'bg-success/15 text-success',
  active: 'bg-primary/15 text-primary',
  attention: 'bg-warning/15 text-warning',
  neutral: 'bg-muted text-muted-foreground',
  muted: 'bg-muted text-muted-foreground line-through decoration-1',
};

export function StatusPill({
  label,
  kind,
  outlined = false,
}: {
  label: string;
  kind: ShowMapStatusKind;
  outlined?: boolean;
}) {
  return (
    <span
      data-outlined={outlined || undefined}
      className={cn(
        'inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        outlined
          ? 'border border-dashed border-muted-foreground/60 text-muted-foreground'
          : KIND_CLASS[kind]
      )}
    >
      {label}
    </span>
  );
}
