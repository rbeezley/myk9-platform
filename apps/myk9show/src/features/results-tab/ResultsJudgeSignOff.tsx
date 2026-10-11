import { CheckCircle2, Circle, Printer } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  getCockpitJudgeDayCatalogHref,
  getCockpitReportHref,
} from '@/features/show-map/cockpit/cockpitRoutes';
import { getOverviewFocusHref } from './resultsTabRoutes';
import { judgeSignOffWording } from '@/features/show-map/judgeSignOff';
import type { JudgeSignOffGroup } from './judgeSignOffGroup';

export const JUDGE_SIGN_OFF_SECTION_ID = 'judge-sign-off';

interface ResultsJudgeSignOffProps {
  showId: string;
  group: JudgeSignOffGroup;
  /** Where the Result Catalog's Back goes: this class on Results. */
  returnTo: string;
  pending: boolean;
  onRecord: (classIds: readonly string[]) => void;
  onUndo: (classId: string) => void;
}

/**
 * The judge's end-of-day sign-off for the day around the open class (MYK9-1031). A judge checks
 * and initials (AKC) or signs (UKC, ASCA) the printed marked catalog once, for every class they
 * judged that day, so this is a per-judge, per-day step, not a per-class one. Recording writes
 * every completed class of the day at once; each class keeps its own undo.
 */
export function ResultsJudgeSignOff({
  showId,
  group,
  returnTo,
  pending,
  onRecord,
  onUndo,
}: ResultsJudgeSignOffProps) {
  const wording = judgeSignOffWording(group.registryId);
  const total = group.classes.length;
  // Two trials on one judge day can hold a class of the same name: say which one each row is.
  const spansTrials = new Set(group.classes.map(item => item.trialLabel)).size > 1;
  const heading = [group.judgeName || 'Judge not set', group.dayLabel].filter(Boolean).join(' · ');
  // MYK9-1036: the catalog for this judge's day alone, not the trial or show that contains it.
  const printHref = group.catalogJudgeDay
    ? getCockpitJudgeDayCatalogHref({ showId, ...group.catalogJudgeDay, returnTo })
    : getCockpitReportHref({ reportId: 'result-catalog', scope: group.catalogScope, returnTo });
  return (
    <section
      id={JUDGE_SIGN_OFF_SECTION_ID}
      aria-labelledby="judge-sign-off-heading"
      className="space-y-2"
    >
      <h3 id="judge-sign-off-heading" className="text-sm font-semibold">
        Judge sign-off
      </h3>
      <div className="space-y-3 rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">
            {heading} · {group.finishedCount} of {total} complete
          </p>
          <p className="text-xs text-muted-foreground">
            {group.signedCount} of {total} {wording.doneStatusLabel.toLowerCase()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" className="min-h-11 gap-2">
            <Link to={printHref}>
              <Printer className="h-4 w-4" aria-hidden="true" />
              Print marked catalog
            </Link>
          </Button>
          {group.recordClassIds.length > 0 ? (
            <Button
              type="button"
              className="min-h-11"
              disabled={pending}
              onClick={() => onRecord(group.recordClassIds)}
            >
              {wording.recordActionLabel(group.judgeName, group.dayLabel)}
            </Button>
          ) : !group.dayComplete ? (
            <p className="text-sm text-muted-foreground">{wording.checklistEndOfDayDetail}</p>
          ) : null}
        </div>
        <ul className="divide-y divide-border rounded-md border">
          {group.classes.map(item => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm">
                {item.signedOffAt ? (
                  <CheckCircle2 className="h-4 w-4 flex-none text-success" aria-hidden="true" />
                ) : (
                  <Circle className="h-4 w-4 flex-none text-muted-foreground" aria-hidden="true" />
                )}
                <span className="truncate">
                  {item.name}
                  {spansTrials && (
                    <span className="text-xs text-muted-foreground"> · {item.trialLabel}</span>
                  )}
                </span>
                {item.needsCompletion && !item.signedOffAt ? (
                  <Link
                    to={getOverviewFocusHref(showId, item.id)}
                    aria-label={`Mark complete first: ${item.name}${spansTrials ? `, ${item.trialLabel}` : ''}`}
                    className="inline-flex min-h-11 items-center text-xs font-medium text-primary hover:underline"
                  >
                    Mark complete first
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {item.signedOffAt
                      ? wording.doneStatusLabel
                      : item.runFinished
                        ? wording.needsStatusLabel
                        : 'Still running'}
                  </span>
                )}
              </span>
              {item.signedOffAt && (
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  disabled={pending}
                  aria-label={`${wording.undoActionLabel}: ${item.name}${spansTrials ? `, ${item.trialLabel}` : ''}`}
                  onClick={() => onUndo(item.id)}
                >
                  {wording.undoActionLabel}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
