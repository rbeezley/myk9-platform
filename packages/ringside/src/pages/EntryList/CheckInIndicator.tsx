/**
 * CheckInIndicator — the entry list's check-in status as an icon (MYK9-1086).
 *
 * The two common states (checked in, not checked in) show the icon alone; the
 * rarer ones pair it with a word, because no icon says "at the gate" by itself.
 * The icon always carries the full label for screen readers.
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
  showWord: boolean;
}

const PRESENTATION: Record<string, CheckInPresentation> = {
  'no-status': {
    Icon: CircleDashed,
    label: 'Not checked in',
    colorClass: 'text-muted-foreground',
    showWord: false,
  },
  'checked-in': {
    Icon: CircleCheck,
    label: 'Checked in',
    colorClass: 'text-success',
    showWord: false,
  },
  'at-gate': { Icon: Fence, label: 'At gate', colorClass: 'text-warning', showWord: true },
  'come-to-gate': {
    Icon: BellRing,
    label: 'Come to gate',
    colorClass: 'text-warning',
    showWord: true,
  },
  conflict: {
    Icon: TriangleAlert,
    label: 'Conflict',
    colorClass: 'text-destructive',
    showWord: true,
  },
  pulled: { Icon: Ban, label: 'Pulled', colorClass: 'text-muted-foreground', showWord: true },
  'in-ring': { Icon: Target, label: 'In ring', colorClass: 'text-info', showWord: true },
  completed: { Icon: Flag, label: 'Completed', colorClass: 'text-success', showWord: true },
};

export function getCheckInPresentation(status: string | null | undefined): CheckInPresentation {
  const known = PRESENTATION[status ?? 'no-status'];
  if (known) return known;
  // Unknown value: never crash the row (memory: status-map lookup crash).
  return {
    Icon: CircleDashed,
    label: getStatusDescriptor('entry', status).label,
    colorClass: 'text-muted-foreground',
    showWord: true,
  };
}

export const CheckInIndicator: React.FC<{ status: string | null | undefined }> = ({ status }) => {
  const { Icon, label, colorClass, showWord } = getCheckInPresentation(status);
  return (
    <span
      className={cn('inline-flex items-center gap-1.5', colorClass)}
      data-testid="check-in-indicator"
    >
      <Icon size={26} strokeWidth={2.2} aria-hidden="true" />
      {showWord ? (
        <span className="whitespace-nowrap text-sm font-semibold">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </span>
  );
};
