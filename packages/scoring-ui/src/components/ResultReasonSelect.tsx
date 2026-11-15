import React from 'react';
import type { ScoresheetSportType } from '../types/scoreData';
import { excusedReasonsFor, nqReasonsFor } from '../utils/resultReasons';

export interface ResultReasonSelectProps {
  /** Which reason list: Not Qualified or Excused. */
  result: 'NQ' | 'EX';
  sportType: ScoresheetSportType;
  reason: string;
  onReasonChange: (reason: string) => void;
}

/**
 * The NQ or Excused reason picker on the UKC and ASCA sheets (MYK9-2008). A
 * reason that is not in the registry's list (a saved score, an older device) is
 * still shown as chosen, so opening the picker never swaps it for the first entry.
 */
export const ResultReasonSelect: React.FC<ResultReasonSelectProps> = ({
  result,
  sportType,
  reason,
  onReasonChange,
}) => {
  const list = result === 'NQ' ? nqReasonsFor(sportType) : excusedReasonsFor(sportType);
  const options = reason && !list.includes(reason) ? [reason, ...list] : list;
  const id = `${result.toLowerCase()}-reason-select`;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="flex-shrink-0 text-sm font-medium">
        {result === 'NQ' ? 'NQ Reason:' : 'Excused Reason:'}
      </label>
      <select
        id={id}
        value={reason}
        onChange={e => onReasonChange(e.target.value)}
        className="h-11 w-full rounded-md border border-input bg-background px-3"
        data-testid={id}
      >
        {!reason && <option value="">Choose a reason</option>}
        {options.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
};
