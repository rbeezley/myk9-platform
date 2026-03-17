import { useNavigate } from 'react-router-dom';
import type { TrialTimelineData } from './schedule-timeline.types';
import { formatStartTime } from './schedule-timeline.utils';
import { StatusDot } from './StatusDot';
import { SpineLine } from './SpineLine';
import { ElementCard } from './ElementCard';

interface TrialSpineProps {
  trial: TrialTimelineData;
  showId: string;
}

export function TrialSpine({ trial, showId }: TrialSpineProps) {
  const navigate = useNavigate();
  const formattedStartTime = formatStartTime(trial.plannedStartTime);

  const trialLabel = trial.trialNumber ? `Trial ${trial.trialNumber}` : 'Trial';

  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
        {trialLabel}
        {formattedStartTime && ` · ${formattedStartTime}`}
      </div>

      {trial.elements.length === 0 ? (
        <p className="text-xs text-muted-foreground">No classes scheduled</p>
      ) : (
        <div className="flex gap-3">
          <div className="flex flex-col items-center pt-1.5">
            {trial.elements.map((el, i) => (
              <div key={el.element} className="flex flex-col items-center">
                <StatusDot status={el.status} />
                {i < trial.elements.length - 1 && <SpineLine className="min-h-[2rem]" />}
              </div>
            ))}
          </div>

          <div className="flex flex-1 flex-col gap-1.5">
            {trial.elements.map(el => (
              <ElementCard
                key={el.element}
                element={el}
                onClick={() => navigate(`/shows/${showId}/trials/${trial.trialId}`)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
