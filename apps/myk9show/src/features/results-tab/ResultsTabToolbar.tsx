import { MoreHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';

import { ListFilterBar, type ListFilterField } from '@/components/list-toolkit';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatWeekdayMonthDay } from '@/lib/format/dates';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { ResultsClassRow } from './buildResultsClassRows';
import { PrintAllReadyDialog } from './PrintAllReadyDialog';
import {
  matchesResultsStatusFilter,
  offeredResultsStatusFilters,
  type ResultsStatusFilterId,
} from './resultsNextAction';
import { getResultsStepHref, type ResultsTabUrlState } from './resultsTabRoutes';

interface ResultsTabToolbarProps {
  showId: string;
  state: ResultsTabUrlState;
  trials: readonly SyncableTrial[];
  /** Every class in the show, so the status counts do not shrink with the other filters. */
  rows: readonly ResultsClassRow[];
  timeZone: string;
  onChange: (next: Partial<ResultsTabUrlState>) => void;
  onOpenVisibility: () => void;
}

function trialOptionLabel(trial: SyncableTrial): string {
  const day = formatWeekdayMonthDay(trial.trialDate);
  const name = trial.name?.trim() || (trial.trialNumber ? `Trial ${trial.trialNumber}` : 'Trial');
  return [day, name].filter(Boolean).join(' · ');
}

/**
 * Filter bar (search, Trial, status), the More menu and the primary Print all ready, on the same
 * list toolkit the Entry Forms tab uses. Density is not offered: the rows are two short lines and
 * the shared control only reshapes the Entry Forms queue.
 */
export function ResultsTabToolbar({
  showId,
  state,
  trials,
  rows,
  timeZone,
  onChange,
  onOpenVisibility,
}: ResultsTabToolbarProps) {
  const countFor = (filter: ResultsStatusFilterId) =>
    rows.filter(row => matchesResultsStatusFilter(row.phase, filter)).length;
  const fields: ListFilterField[] = [
    {
      kind: 'options',
      key: 'trial',
      label: 'Trial',
      allLabel: 'All trials',
      value: state.trialId,
      options: trials.map(trial => ({ value: trial.id, label: trialOptionLabel(trial) })),
      onChange: value => onChange({ trialId: value }),
    },
    {
      kind: 'options',
      key: 'status',
      label: 'Show',
      allLabel: 'All classes',
      value: state.status === 'all' ? null : state.status,
      options: offeredResultsStatusFilters()
        .filter(option => option.id !== 'all')
        .map(option => ({
          value: option.id,
          label: option.label,
          count: countFor(option.id),
        })),
      onChange: value => onChange({ status: (value as ResultsStatusFilterId | null) ?? 'all' }),
    },
  ];
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
      <div className="min-w-0 flex-1 basis-[22rem]">
        <ListFilterBar
          searchValue={state.search}
          onSearchChange={search => onChange({ search })}
          searchPlaceholder="Search class or dog…"
          fields={fields}
        />
      </div>
      <div className="flex flex-none items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="min-h-11 gap-2">
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              More
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 space-y-2">
            <p className="text-sm font-semibold">Results tools</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 w-full justify-start"
              onClick={onOpenVisibility}
            >
              Visibility settings
            </Button>
            <Button asChild variant="outline" size="sm" className="min-h-11 w-full justify-start">
              <Link to={getResultsStepHref(showId, 'submit')}>Submit to registry</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="min-h-11 w-full justify-start">
              <Link to={getResultsStepHref(showId, 'close')}>Close the show</Link>
            </Button>
          </PopoverContent>
        </Popover>
        <PrintAllReadyDialog rows={rows} timeZone={timeZone} />
      </div>
    </div>
  );
}
