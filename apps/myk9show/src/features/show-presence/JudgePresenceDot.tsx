/**
 * JudgePresenceDot — Phase 1 of docs/plan-show-presence.md.
 *
 * A tiny green dot next to a class/ring row when a judge is currently present
 * there, so a secretary sees at a glance which rings are staffed.
 *
 * INTENT: calm, at-a-glance, no motion. The dot is steady (not pulsing) — per
 * docs/INTENT.md the secretary surface favors "calm over clever"; motion would
 * read as noise on a busy board. Renders nothing when no judge is present.
 */

import { cn } from '@/lib/utils';
import type { ShowPresence } from './types';
import { judgesOnClass } from './presenceSelectors';

export interface JudgePresenceDotProps {
  present: ShowPresence[];
  classId: string;
  className?: string;
}

export function JudgePresenceDot({ present, classId, className }: JudgePresenceDotProps) {
  const judges = judgesOnClass(present, classId);
  if (judges.length === 0) return null;

  const names = judges.map(j => j.name).join(', ');
  return (
    <span
      title={`Judge online: ${names}`}
      aria-label={`Judge online: ${names}`}
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500', className)}
    />
  );
}
