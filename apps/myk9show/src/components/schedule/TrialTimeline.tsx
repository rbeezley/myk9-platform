import { useNavigate } from 'react-router-dom';
import { useTrialTimeline } from '@/hooks/queries/useTrialTimeline';
import { JudgeSection } from './JudgeSection';

interface TrialTimelineProps {
  trialId: string;
  showId: string;
}

export function TrialTimeline({ trialId, showId }: TrialTimelineProps) {
  const { data, isLoading, error, refetch } = useTrialTimeline(trialId);
  const navigate = useNavigate();

  const handleNavigateToClass = (classId: string) => {
    navigate(`/shows/${showId}/trials/${trialId}/classes/${classId}`);
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-muted" />
          <div className="h-4 w-28 rounded bg-muted" />
        </div>
        <div className="flex gap-3">
          <div className="flex flex-col items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-muted" />
            <div className="h-10 w-0.5 bg-muted" />
            <div className="h-2.5 w-2.5 rounded-full bg-muted" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="h-12 rounded-md bg-muted" />
            <div className="h-12 rounded-md bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-destructive">Failed to load timeline.</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary underline">
          Try again
        </button>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground">No schedule available for this trial.</p>;
  }

  return (
    <div className="space-y-6">
      {data.map(judge => (
        <JudgeSection
          key={judge.judgeId ?? 'unassigned'}
          judge={judge}
          onNavigateToClass={handleNavigateToClass}
        />
      ))}
    </div>
  );
}
