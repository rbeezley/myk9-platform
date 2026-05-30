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

import { useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, AlertCircle, User, ChevronRight, Star } from 'lucide-react';
import {
  groupSectionedClasses,
  getClassIds,
  getFormattedClassStatus,
  type ClassEntry,
} from '@myk9/ringside';
import { useAtShowClassList } from './useAtShowClassList';
import { useAccountTodayAutoFavorites } from '@/features/show-today/accountTodayEntries';

export const AtShowClassListPage: React.FC = () => {
  const { showId } = useParams<{ showId: string }>();
  const navigate = useNavigate();
  const { groups, organization, showName, isLoading, error } = useAtShowClassList(showId);
  useAccountTodayAutoFavorites(showId);

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
        return (
          <section key={trial.id} className="mb-6">
            <h2 className="mb-2 px-1 text-sm font-medium text-muted-foreground">
              {trialNumber ? `Trial ${trialNumber}` : 'Trial'}
              {trialDate ? ` · ${trialDate}` : ''}
            </h2>
            <ul className="space-y-2">
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
          </section>
        );
      })}
    </div>
  );
};

export default AtShowClassListPage;
