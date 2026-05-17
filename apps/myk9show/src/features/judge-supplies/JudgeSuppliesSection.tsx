import { useMemo, useState } from 'react';
import { Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTrialJudges } from './useTrialJudges';
import { useTrialRegistry } from './useTrialRegistry';
import { useTrialJudgeSupplies } from './useTrialJudgeSupplies';
import { ManageJudgeSuppliesDialog } from './ManageJudgeSuppliesDialog';
import { judgeKey, type JudgeKey, type TrialJudgeSupplyRow } from './types';

export interface JudgeSuppliesSectionProps {
  trialId: string;
}

export function JudgeSuppliesSection({ trialId }: JudgeSuppliesSectionProps) {
  const judgesQuery = useTrialJudges(trialId);
  const registryQuery = useTrialRegistry(trialId);
  const supplies = useTrialJudgeSupplies(trialId);
  const [openJudge, setOpenJudge] = useState<JudgeKey | null>(null);

  const judges = judgesQuery.data ?? [];
  const rowsByJudge = useMemo(() => indexByJudge(supplies.rows), [supplies.rows]);
  const isLoading = judgesQuery.isLoading;

  return (
    <div className="myk9-trials-section">
      <div className="myk9-trials-header">
        <div className="myk9-trials-title">
          <div className="myk9-trials-icon">
            <Package className="w-4 h-4" />
          </div>
          Judge Supplies
        </div>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground p-4">Loading judges…</p>
      )}

      {!isLoading && judges.length === 0 && (
        <p className="text-sm text-muted-foreground p-4" data-testid="judge-supplies-empty">
          No judges assigned yet — supplies appear once judges are added to classes in this trial.
        </p>
      )}

      {!isLoading && judges.length > 0 && (
        <ul className="divide-y divide-border/40" role="list">
          {judges.map(judge => {
            const key = judgeKey(judge);
            const judgeRows = rowsByJudge.get(key) ?? [];
            const total = judgeRows.length;
            const customCount = judgeRows.filter(r => r.is_custom).length;
            const excludedCount = judgeRows.filter(r => !r.included).length;
            const summary =
              total === 0
                ? 'Not configured yet'
                : `${total} item${total === 1 ? '' : 's'}` +
                  (customCount > 0 ? ` · ${customCount} custom` : '') +
                  (excludedCount > 0 ? ` · ${excludedCount} excluded` : '');
            return (
              <li
                key={key}
                className="flex items-center justify-between px-4 py-3"
                data-testid={`judge-row-${key}`}
              >
                <div>
                  <p className="font-medium text-sm">{judge.judge_name}</p>
                  <p className="text-xs text-muted-foreground">{summary}</p>
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

      {openJudge && (
        <ManageJudgeSuppliesDialog
          open={!!openJudge}
          onOpenChange={open => {
            if (!open) setOpenJudge(null);
          }}
          trialId={trialId}
          judge={openJudge}
          registryId={registryQuery.data ?? null}
        />
      )}
    </div>
  );
}

function indexByJudge(rows: TrialJudgeSupplyRow[]): Map<string, TrialJudgeSupplyRow[]> {
  const map = new Map<string, TrialJudgeSupplyRow[]>();
  for (const row of rows) {
    const key = judgeKey(row);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}
