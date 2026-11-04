import { formatTrialLabel } from '@myk9/core';
import { useCallback, useState } from 'react';
import { useJudgesOnDays } from './judgesOnDays';
import { useShowDeskCloseGuard } from '@/features/show-map/showDeskCloseGuard';
import { formatEntryDate } from '@/lib/format/dates';
import { LunchOrdersDay } from './LunchOrdersDay';
import { useVolunteersOnDays } from './useLunchOrders';

export interface LunchOrdersTrial {
  id: string;
  name?: string | undefined;
  trialNumber?: string | undefined;
  trialDate?: string | undefined;
}

interface LunchOrdersToolProps {
  showId: string;
  trials: readonly LunchOrdersTrial[];
}

/**
 * Show Desk "Lunch orders": one list per show day for anyone working the trial. Planning only:
 * it carries no reminders and contributes nothing to the Actions badge (MYK9-1694).
 */
export function LunchOrdersTool({ showId, trials }: LunchOrdersToolProps) {
  const [dirtyDays, setDirtyDays] = useState<ReadonlySet<string>>(new Set());
  const markDay = useCallback((trialId: string, dirty: boolean) => {
    setDirtyDays(current => {
      if (current.has(trialId) === dirty) return current;
      const next = new Set(current);
      if (dirty) next.add(trialId);
      else next.delete(trialId);
      return next;
    });
  }, []);
  // Closing the Show Desk panel with unsaved rows asks first.
  useShowDeskCloseGuard(dirtyDays.size > 0);
  const judges = useJudgesOnDays(
    showId,
    trials.map(trial => trial.id)
  );
  const volunteers = useVolunteersOnDays(
    showId,
    trials.map(trial => trial.id)
  );

  return (
    <section className="space-y-4" aria-labelledby="lunch-orders-title">
      <div>
        <h3 id="lunch-orders-title" className="text-base font-semibold">
          Lunch orders
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan lunch for anyone working each day. People already assigned are listed for you. Use
          Add person for anyone else.
        </p>
      </div>
      {trials.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add a trial day to the show before planning lunch.
        </p>
      ) : (
        trials.map(trial => (
          <div key={trial.id} className="space-y-2 rounded-md border bg-card p-4">
            <h4 className="text-sm font-semibold">
              {formatTrialLabel(trial)}
              {trial.trialDate ? (
                <span className="ml-2 font-normal text-muted-foreground">
                  {formatEntryDate(trial.trialDate, { style: 'long' })}
                </span>
              ) : null}
            </h4>
            <LunchOrdersDay
              showId={showId}
              trialId={trial.id}
              volunteers={volunteers}
              judges={judges}
              onDirtyChange={markDay}
            />
          </div>
        ))
      )}
    </section>
  );
}
