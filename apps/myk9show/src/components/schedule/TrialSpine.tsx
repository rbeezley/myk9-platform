import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TrialTimelineData } from './schedule-timeline.types';
import { formatStartTime } from './schedule-timeline.utils';
import { StatusDot } from './StatusDot';
import { ElementCard } from './ElementCard';

interface TrialSpineProps {
  trial: TrialTimelineData;
  showId: string;
}

export function TrialSpine({ trial, showId }: TrialSpineProps) {
  const navigate = useNavigate();
  const formattedStartTime = formatStartTime(trial.plannedStartTime);

  const handleTrialClick = useCallback(
    () => navigate(`/shows/${showId}/trials/${trial.trialId}`),
    [navigate, showId, trial.trialId]
  );

  const trialLabel = trial.trialNumber
    ? /^\d+$/.test(trial.trialNumber)
      ? `Trial ${trial.trialNumber}`
      : trial.trialNumber
    : 'Trial';

  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
        {trialLabel}
        {formattedStartTime && ` · ${formattedStartTime}`}
      </div>

      {trial.elements.length === 0 ? (
        <p className="text-xs text-muted-foreground">No classes scheduled</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {trial.elements.map((el, i) => (
            <div key={el.element} className="flex items-center gap-3">
              {/* Dot + connecting line segments (0.375rem = half of parent gap-1.5, bridges the gap between rows) */}
              <div className="relative flex shrink-0 items-center self-stretch justify-center w-2.5">
                <StatusDot status={el.status} className="relative z-10" />
                {i < trial.elements.length - 1 && (
                  <div className="absolute top-1/2 bottom-[-0.375rem] left-1/2 w-0.5 -translate-x-1/2 bg-border" />
                )}
                {i > 0 && (
                  <div className="absolute top-[-0.375rem] bottom-1/2 left-1/2 w-0.5 -translate-x-1/2 bg-border" />
                )}
              </div>
              <div className="flex-1">
                <ElementCard element={el} onClick={handleTrialClick} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
