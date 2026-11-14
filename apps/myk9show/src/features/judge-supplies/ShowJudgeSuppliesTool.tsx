import { formatTrialLabel } from '@myk9/core';
import { useMemo, useState } from 'react';
import { useJudgesOnDays } from '@/features/lunch-orders/judgesOnDays';
import { deriveRegistryId } from '@/features/registries';
import { Button } from '@/components/ui/button';
import { judgesAcrossTrials, type JudgeAcrossTrials } from './judgesAcrossTrials';
import { ManageJudgeSuppliesDialog } from './ManageJudgeSuppliesDialog';
import { useShowJudgeSupplyRows } from './useShowJudgeSupplies';
import { judgeKey, type ShowJudgeSupplyRow } from './types';

export interface SuppliesTrial {
  id: string;
  name?: string | undefined;
  trialNumber?: string | undefined;
}

interface ShowJudgeSuppliesToolProps {
  showId: string;
  /** `shows.organization`: the show's registry decides which default supply list is seeded. */
  organization?: string | null | undefined;
  trials: readonly SuppliesTrial[];
}

function summarize(rows: readonly ShowJudgeSupplyRow[]): string {
  if (rows.length === 0) return 'Not configured yet';
  const custom = rows.filter(r => r.is_custom).length;
  const excluded = rows.filter(r => !r.included).length;
  return (
    `${rows.length} item${rows.length === 1 ? '' : 's'}` +
    (custom > 0 ? ` · ${custom} custom` : '') +
    (excluded > 0 ? ` · ${excluded} excluded` : '')
  );
}

/**
 * Show Desk "Judge supplies" (MYK9-1728): every judge at the show once. A judge's list is stored
 * once per show (`show_judge_supplies`), so a judge on two trials has exactly one list; the
 * trials are shown only so the secretary can see where the judge works.
 */
export function ShowJudgeSuppliesTool({
  showId,
  organization,
  trials,
}: ShowJudgeSuppliesToolProps) {
  const trialIds = useMemo(() => trials.map(trial => trial.id), [trials]);
  const judgesQuery = useJudgesOnDays(showId, trialIds);
  const suppliesQuery = useShowJudgeSupplyRows(showId);
  const [openJudge, setOpenJudge] = useState<JudgeAcrossTrials | null>(null);

  const judges = useMemo(
    () => judgesAcrossTrials(trialIds, judgesQuery.byTrial),
    [trialIds, judgesQuery.byTrial]
  );
  const trialLabel = useMemo(
    () => new Map(trials.map(trial => [trial.id, formatTrialLabel(trial)])),
    [trials]
  );
  const rows = suppliesQuery.data;
  // Only a failure with nothing cached is shown: a failed background refresh keeps the last rows.
  const suppliesFailed = suppliesQuery.isError && !rows;
  // Offline with nothing cached: the read is paused (no request runs), not loading.
  const suppliesPaused = !rows && !suppliesFailed && suppliesQuery.fetchStatus === 'paused';

  return (
    <section className="space-y-4" aria-labelledby="judge-supplies-title">
      <div>
        <h3 id="judge-supplies-title" className="text-base font-semibold">
          Judge supplies
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Set each judge&apos;s supply list once. It applies to every trial the judge is on.
        </p>
      </div>
      {judgesQuery.isLoading && <p className="text-sm text-muted-foreground">Loading judges…</p>}
      {judgesQuery.isError && (
        <p className="text-sm text-destructive">Could not load the show&apos;s judges.</p>
      )}
      {judgesQuery.hasData && judges.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="judge-supplies-empty">
          No judges assigned yet. Supplies appear once judges are added to classes in this show.
        </p>
      )}
      {judges.length > 0 && suppliesFailed && (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-destructive">Could not load the judges&apos; supply lists.</p>
          {/* No in-flight label: a refetch with no data resets the query to pending, so this
              alert unmounts and the rows say Loading… until the retry settles. */}
          <Button size="sm" variant="outline" onClick={() => void suppliesQuery.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {judges.length > 0 && (
        <ul className="divide-y divide-border/40" role="list">
          {judges.map(judge => {
            const judgeRows = (rows ?? []).filter(row => judgeKey(row) === judge.key);
            return (
              <li
                key={judge.key}
                className="flex items-center justify-between gap-3 py-3"
                data-testid={`judge-row-${judge.key}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{judge.judge_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {judge.trialIds.map(id => trialLabel.get(id)).join(', ')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {rows
                      ? summarize(judgeRows)
                      : suppliesFailed
                        ? 'Supplies not loaded'
                        : suppliesPaused
                          ? 'Not available offline. Connect to load supplies.'
                          : 'Loading…'}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOpenJudge(judge)}
                  aria-label={`Edit supplies for ${judge.judge_name}`}
                >
                  Edit
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {/* A sibling of the list, never inside a `translate`d popup: the slide-over's
          `position: fixed` would size to that popup. `contents` keeps `space-y-*` margin off
          its backdrop (the same rule every slide-over here follows). */}
      <div className="contents">
        {openJudge && (
          <ManageJudgeSuppliesDialog
            key={openJudge.key}
            open
            onOpenChange={open => {
              if (!open) setOpenJudge(null);
            }}
            showId={showId}
            judge={openJudge}
            registryId={deriveRegistryId(organization)}
          />
        )}
      </div>
    </section>
  );
}
