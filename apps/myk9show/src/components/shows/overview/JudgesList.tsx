import { Card } from '@/components/ui/card';
import { PersonAvatar } from '@/components/common/PersonAvatar';
import type { ShowJudgeAssignment } from '@/types/judge-types';

interface JudgesListProps {
  judges?: ShowJudgeAssignment[];
}

export function JudgesList({ judges }: JudgesListProps) {
  const hasJudges = judges && judges.length > 0;

  return (
    <Card>
      <div className="p-4 border-b border-border/30">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Judges</h3>
      </div>
      {hasJudges ? (
        <div className="divide-y divide-border/30">
          {judges.map(judge => {
            const classCount = judge.assignedClasses?.length || 0;
            return (
              <div key={judge.judgeId || judge.judgeName} className="flex items-center gap-3 p-4">
                <PersonAvatar name={judge.judgeName} size="md" />
                <div className="min-w-0">
                  <div className="font-medium text-foreground text-sm">{judge.judgeName}</div>
                  {classCount > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {classCount} class{classCount !== 1 ? 'es' : ''} assigned
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-6 text-center text-sm text-muted-foreground">
          Judges not yet announced
        </div>
      )}
    </Card>
  );
}
