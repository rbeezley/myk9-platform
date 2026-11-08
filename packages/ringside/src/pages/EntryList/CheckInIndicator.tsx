/**
 * CheckInIndicator — the entry list's check-in status, icon and word (MYK9-1086).
 *
 * INTENT: every status shows its word, including the two common ones. The icon
 * alone read as a label, not a control, so stewards tapped the dog's name
 * instead and opened the scoresheet (MYK9-1763). The control itself is the
 * StatusBadge button around this indicator.
 *
 * Interim: this map is local to the entry list. The plan moves these glyphs
 * into the shared `@myk9/ui` StatusIcon set so the check-in dialog and every
 * other entry-status surface use the same ones.
 */

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Ban,
  BellRing,
  CircleCheck,
  CircleDashed,
  Fence,
  Flag,
  Target,
  TriangleAlert,
} from 'lucide-react';
import { cn, getStatusDescriptor } from '@myk9/ui';

interface CheckInPresentation {
  Icon: LucideIcon;
  label: string;
  colorClass: string;
}

const PRESENTATION: Record<string, CheckInPresentation> = {
  'no-status': {
    Icon: CircleDashed,
    label: 'Not checked in',
    colorClass: 'text-muted-foreground',
  },
  'checked-in': {
    Icon: CircleCheck,
    label: 'Checked in',
    colorClass: 'text-success',
  },
  'at-gate': { Icon: Fence, label: 'At gate', colorClass: 'text-warning' },
  'come-to-gate': {
    Icon: BellRing,
    label: 'Come to gate',
    colorClass: 'text-warning',
  },
  conflict: {
    Icon: TriangleAlert,
    label: 'Conflict',
    colorClass: 'text-destructive',
  },
  pulled: { Icon: Ban, label: 'Pulled', colorClass: 'text-muted-foreground' },
  'in-ring': { Icon: Target, label: 'In ring', colorClass: 'text-info' },
  completed: { Icon: Flag, label: 'Completed', colorClass: 'text-success' },
};

export function getCheckInPresentation(status: string | null | undefined): CheckInPresentation {
  const known = PRESENTATION[status ?? 'no-status'];
  if (known) return known;
  // Unknown value: never crash the row (memory: status-map lookup crash).
  return {
    Icon: CircleDashed,
    label: getStatusDescriptor('entry', status).label,
    colorClass: 'text-muted-foreground',
  };
}

export const CheckInIndicator: React.FC<{
  status: string | null | undefined;
  /** On a solid primary surface (the in-ring hero): draw in the foreground-on-primary colour. */
  inverse?: boolean | undefined;
}> = ({ status, inverse = false }) => {
  const presentation = getCheckInPresentation(status);
  const { Icon, label } = presentation;
  const colorClass = inverse ? 'text-primary-foreground' : presentation.colorClass;
  return (
    <span
      className={cn('inline-flex min-w-0 items-center gap-1', colorClass)}
      data-testid="check-in-indicator"
    >
      <Icon size={16} strokeWidth={2.4} aria-hidden="true" className="shrink-0" />
      {/* One line: when the button does not fit beside the name, DogCard wraps it onto its
          own line rather than break the word (MYK9-1763). */}
      <span className="whitespace-nowrap text-sm font-semibold">{label}</span>
    </span>
  );
};
