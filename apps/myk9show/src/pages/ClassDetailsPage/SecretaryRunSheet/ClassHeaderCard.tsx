import {
  Package,
  Home,
  TreePine,
  Shovel,
  Play,
  CheckCircle2,
  Printer,
  Users,
  Flag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/base/Chip';
import { logger } from '@/services/LoggingService';
import type { ClassPhase, RunSheetEntry } from './types';

const ELEMENT_CONFIG: Record<string, { gradient: [string, string]; Icon: React.ElementType }> = {
  Container: { gradient: ['#ccfbf1', '#0d9488'], Icon: Package },
  Interior: { gradient: ['#fef3c7', '#c96442'], Icon: Home },
  Exterior: { gradient: ['#fde68a', '#d97706'], Icon: TreePine },
  Buried: { gradient: ['#d1fae5', '#059669'], Icon: Shovel },
};

interface ClassHeaderCardProps {
  element: string;
  level: string;
  judge: string;
  startTime: string;
  timeLimit: string;
  entries: RunSheetEntry[];
  classPhase: ClassPhase;
  onStartClass: () => void;
  onCloseClass: () => void;
}

export function ClassHeaderCard({
  element,
  level,
  judge,
  startTime,
  timeLimit,
  entries,
  classPhase,
  onStartClass,
  onCloseClass,
}: ClassHeaderCardProps) {
  const cfg =
    ELEMENT_CONFIG[element] ??
    (logger.warn('Unknown element type', 'run-sheet', { element }), ELEMENT_CONFIG.Container);
  const [c1, c2] = cfg.gradient;
  const { Icon } = cfg;

  const { checkedIn, finished, scratched } = entries.reduce(
    (acc, e) => ({
      checkedIn: acc.checkedIn + (e.isCheckedIn || e.isScored ? 1 : 0),
      finished: acc.finished + (e.isScored ? 1 : 0),
      scratched: acc.scratched + (e.isScratched ? 1 : 0),
    }),
    { checkedIn: 0, finished: 0, scratched: 0 }
  );

  return (
    <div className="rounded-2xl border border-border bg-card p-6 mb-5">
      <div className="grid gap-6 items-center" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
        <div
          className="flex items-center justify-center rounded-xl shrink-0"
          style={{ width: 80, height: 80, background: `linear-gradient(135deg, ${c1}, ${c2})` }}
        >
          <Icon size={40} color="#fff" />
        </div>

        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">
            {judge} · {startTime}
          </p>
          <h1 className="font-serif text-4xl font-medium leading-tight">
            {element} · {level}
            <span className="text-muted-foreground text-2xl font-normal ml-3">
              Limit {timeLimit}
            </span>
          </h1>
          <div className="flex gap-2 flex-wrap mt-3">
            <Chip color="stone" size="sm" leadingIcon={<Users size={12} />}>
              {entries.length} entries
            </Chip>
            <Chip color="green" size="sm" leadingIcon={<CheckCircle2 size={12} />}>
              {checkedIn} checked in
            </Chip>
            <Chip color="teal" size="sm" leadingIcon={<Flag size={12} />}>
              {finished} finished
            </Chip>
            {scratched > 0 && (
              <Chip color="red" size="sm">
                {scratched} scratched
              </Chip>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 items-end">
          {classPhase === 'not-started' && (
            <Button size="lg" onClick={onStartClass} className="gap-2">
              <Play size={16} /> Start class
            </Button>
          )}
          {classPhase === 'in-progress' && (
            <Button size="lg" onClick={onCloseClass} variant="outline" className="gap-2">
              <CheckCircle2 size={16} /> Close class
            </Button>
          )}
          {classPhase === 'finished' && (
            <Chip color="green" leadingIcon={<CheckCircle2 size={14} />}>
              Class closed
            </Chip>
          )}
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
            <Printer size={13} /> Print run sheet
          </Button>
        </div>
      </div>
    </div>
  );
}
