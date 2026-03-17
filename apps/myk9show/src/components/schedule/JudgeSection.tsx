import type { JudgeTimelineData } from './schedule-timeline.types';
import { StatusDot } from './StatusDot';
import { SpineLine } from './SpineLine';
import { ElementAccordion } from './ElementAccordion';

interface JudgeSectionProps {
  judge: JudgeTimelineData;
  onNavigateToClass?: (classId: string) => void;
}

function getJudgeInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const JUDGE_COLORS = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-teal-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-emerald-500',
];

export function JudgeSection({ judge, onNavigateToClass }: JudgeSectionProps) {
  const colorIndex = judge.judgeId
    ? Math.abs(judge.judgeId.charCodeAt(0) + judge.judgeId.charCodeAt(1)) % JUDGE_COLORS.length
    : 0;
  const avatarColor = judge.judgeId ? JUDGE_COLORS[colorIndex] : 'bg-slate-500';

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2 border-b border-border pb-1.5">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white ${avatarColor}`}
        >
          {getJudgeInitials(judge.judgeName)}
        </div>
        <span className="text-sm font-medium text-card-foreground">{judge.judgeName}</span>
        {judge.ringNumber && (
          <span className="ml-auto text-xs text-muted-foreground">Ring {judge.ringNumber}</span>
        )}
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col items-center pt-2.5">
          {judge.elements.map((el, i) => (
            <div key={el.element} className="flex flex-col items-center">
              <StatusDot status={el.status} />
              {i < judge.elements.length - 1 && <SpineLine className="min-h-[2.5rem]" />}
            </div>
          ))}
        </div>

        <div className="flex flex-1 flex-col gap-1">
          {judge.elements.map(el => (
            <ElementAccordion
              key={el.element}
              element={el}
              {...(onNavigateToClass && { onNavigateToClass })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
