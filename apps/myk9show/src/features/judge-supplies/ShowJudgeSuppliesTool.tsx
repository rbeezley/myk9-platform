import { formatTrialLabel } from '@myk9/core';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useJudgesOnDays } from '@/features/lunch-orders/judgesOnDays';
import { Button } from '@/components/ui/button';
import { judgesAcrossTrials, type JudgeAcrossTrials } from './judgesAcrossTrials';
import { ManageJudgeSuppliesDialog } from './ManageJudgeSuppliesDialog';
import { SUPPLIES_QUERY_ROOT } from './useTrialJudgeSupplies';
import { useTrialRegistry } from './useTrialRegistry';
import { trialJudgeSuppliesService } from './trialJudgeSuppliesService';
import { judgeKey, type TrialJudgeSupplyRow } from './types';

export interface SuppliesTrial {
  id: string;
  name?: string | undefined;
  trialNumber?: string | undefined;
}

interface ShowJudgeSuppliesToolProps {
  showId: string;
  trials: readonly SuppliesTrial[];
}

function summarize(rows: readonly TrialJudgeSupplyRow[]): string {
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
 * Show Desk "Judge supplies" (MYK9-1728): every judge at the show once. The list is edited on
 * the judge's first trial and copied onto the rest, so a judge on two trials is set up once.
 * Storage stays per trial (`trial_judge_supplies`), which the report reads.
 */
export function ShowJudgeSuppliesTool({ showId, trials }: ShowJudgeSuppliesToolProps) {
  const trialIds = useMemo(() => trials.map(trial => trial.id), [trials]);
  const judgesQuery = useJudgesOnDays(showId, trialIds);
  const suppliesQuery = useQuery({
    queryKey: [SUPPLIES_QUERY_ROOT, 'show', showId] as const,
    queryFn: () => trialJudgeSuppliesService.listForShow(showId),
  });
  const [openJudge, setOpenJudge] = useState<JudgeAcrossTrials | null>(null);
  const registryQuery = useTrialRegistry(openJudge?.trialIds[0]);

  const judges = useMemo(
    () => judgesAcrossTrials(trialIds, judgesQuery.byTrial),
    [trialIds, judgesQuery.byTrial]
  );
  const trialLabel = useMemo(
    () => new Map(trials.map(trial => [trial.id, formatTrialLabel(trial)])),
    [trials]
  );
  const rows = suppliesQuery.data;

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
      {judges.length > 0 && (
        <ul className="divide-y divide-border/40" role="list">
          {judges.map(judge => {
            const judgeRows = (rows ?? []).filter(
              row => row.trial_id === judge.trialIds[0] && judgeKey(row) === judge.key
            );
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
                    {rows ? summarize(judgeRows) : 'Loading…'}
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
          its backdrop (same rule as JudgeSuppliesSection). */}
      <div className="contents">
        {openJudge && (
          <ManageJudgeSuppliesDialog
            key={openJudge.key}
            open
            onOpenChange={open => {
              if (!open) setOpenJudge(null);
            }}
            trialId={openJudge.trialIds[0]!}
            judge={openJudge}
            registryId={registryQuery.data ?? null}
            mirrorTrialIds={openJudge.trialIds.slice(1)}
          />
        )}
      </div>
    </section>
  );
}
