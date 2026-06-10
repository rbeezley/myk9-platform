/**
 * AtShowClassListPage — Phase 1h at-show class picker (mobile cards).
 *
 * The navigation entry into the at-show flow: a judge taps a class card instead
 * of typing IDs. Classes are grouped by trial; Novice Section A/B pairs are
 * collapsed into one "A & B" card (via ringside `groupSectionedClasses`) that
 * routes to the combined EntryList; everything else routes to the single-class
 * EntryList. Mounted at `/at-show/:showId` (flag-gated, staff-guarded).
 *
 * Card styling is host-side (Tailwind) under `.ringside-root`; matching myK9Q's
 * exact class-card look is part of the visual-polish pass.
 */

import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, AlertCircle, User, ChevronRight, Star } from 'lucide-react';
import {
  groupSectionedClasses,
  getClassIds,
  getFormattedClassStatus,
  type ClassEntry,
} from '@myk9/ringside';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useAtShowClassList } from './useAtShowClassList';
import { loadCollapsedTrialIds, saveCollapsedTrialIds } from './atShowClassListState';

export const AtShowClassListPage: React.FC = () => {
  const { showId } = useParams<{ showId: string }>();
  const navigate = useNavigate();
  const { groups, organization, showName, isLoading, error, refresh } =
    useAtShowClassList(showId);

  // Group Novice A/B pairs into single combined entries per trial.
  const groupedByTrial = useMemo(
    () =>
      groups.map(g => ({
        trial: g.trial,
        classes: groupSectionedClasses(g.classes, organization),
      })),
    [groups, organization]
  );

  const handleClassClick = useCallback(
    (entry: ClassEntry) => {
      const ids = getClassIds(entry);
      navigate(
        ids.length === 2
          ? `/at-show/${showId}/class/${ids[0]}/${ids[1]}`
          : `/at-show/${showId}/class/${ids[0]}`
      );
    },
    [navigate, showId]
  );

  // Trial sections default to open; we track the COLLAPSED ones so an empty
  // record means "all expanded" (the page's original behavior). Persisted
  // per-show so a judge's focus on one ring survives reloads.
  const [collapsedTrialIds, setCollapsedTrialIds] = useState<Set<string>>(
    () => new Set(showId ? loadCollapsedTrialIds(showId) : [])
  );

  // The `/at-show/:showId` route reuses this component instance across a param
  // change (no remount), so re-load the per-show collapsed set whenever the
  // show changes — otherwise the new show would inherit the previous show's
  // collapsed sections and the next toggle would persist them under its key.
  // React's "adjust state during render" pattern (no effect): reset when the
  // tracked show id no longer matches the current one.
  const [trackedShowId, setTrackedShowId] = useState(showId);
  if (showId !== trackedShowId) {
    setTrackedShowId(showId);
    setCollapsedTrialIds(new Set(showId ? loadCollapsedTrialIds(showId) : []));
  }

  const toggleTrial = useCallback(
    (trialId: string, open: boolean) => {
      setCollapsedTrialIds(current => {
        const next = new Set(current);
        // `open` is the next desired state from the Collapsible: open => not collapsed.
        if (open) next.delete(trialId);
        else next.add(trialId);
        if (showId) saveCollapsedTrialIds(showId, [...next]);
        return next;
      });
    },
    [showId]
  );

  if (isLoading) {
    return (
      <div className="ringside-root flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="ringside-root flex flex-col items-center justify-center h-96 gap-3 px-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-lg font-medium text-destructive">Failed to load classes</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button variant="outline" className="min-h-11 px-6" onClick={refresh}>
          Try again
        </Button>
      </div>
    );
  }

  const hasClasses = groupedByTrial.some(g => g.classes.length > 0);
  if (!hasClasses) {
    return (
      <div className="ringside-root flex flex-col items-center justify-center h-96 gap-2 px-4 text-center">
        <p className="text-lg font-medium">No classes</p>
        <p className="text-sm text-muted-foreground">This show has no classes yet.</p>
      </div>
    );
  }

  return (
    <div className="ringside-root mx-auto max-w-2xl px-4 py-4">
      {showName && <h1 className="mb-4 text-center text-lg font-semibold">{showName}</h1>}

      {groupedByTrial.map(({ trial, classes }) => {
        if (classes.length === 0) return null;
        const trialNumber = trial.trialNumber ?? trial.trial_number;
        const trialDate = trial.date ?? trial.trial_date;
        const isOpen = !collapsedTrialIds.has(trial.id);
        const trialLabel = `${trialNumber ? `Trial ${trialNumber}` : 'Trial'}${
          trialDate ? ` · ${trialDate}` : ''
        }`;
        return (
          <Collapsible
            key={trial.id}
            open={isOpen}
            onOpenChange={open => toggleTrial(trial.id, open)}
            className="mb-6"
            data-testid={`at-show-trial-${trial.id}`}
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex min-h-11 w-full items-center gap-2 px-1 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${trialLabel}`}
              >
                <ChevronRight
                  size={16}
                  className={cn('shrink-0 transition-transform', { 'rotate-90': isOpen })}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{trialLabel}</span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {classes.length}
                </span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-2 space-y-2">
                {classes.map(entry => {
                  const status = getFormattedClassStatus(entry);
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => handleClassClick(entry)}
                        className={`flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md active:scale-[0.99] ${
                          entry.is_favorite ? 'border-emerald-400 bg-emerald-50' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {entry.is_favorite && (
                              <Star
                                size={15}
                                className="shrink-0 fill-emerald-600 text-emerald-600"
                              />
                            )}
                            <span className="truncate font-medium">{entry.class_name}</span>
                          </div>
                          {entry.judge_name && entry.judge_name !== 'No Judge Assigned' && (
                            <div className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted-foreground">
                              <User size={13} className="shrink-0" />
                              {entry.judge_name}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                            {status.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {entry.completed_count} / {entry.entry_count}
                          </span>
                        </div>
                        <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
};

export default AtShowClassListPage;
