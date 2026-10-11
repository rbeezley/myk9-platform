import React from 'react';
import { Input } from '@myk9/ui';
import type { ScoresheetSportType } from '../types/scoreData';

/**
 * Active styling for the DQ result button. Deliberately unlike Excused (red):
 * a disqualification is an official record, so it must never be mistaken for the
 * far more common Excused result at a glance (MYK9-1011).
 */
export const DQ_ACTIVE_CLASS =
  'bg-zinc-900 hover:bg-black border-zinc-900 text-white ring-2 ring-offset-1 ring-red-600 shadow-lg';

/** When a judge may disqualify, in each registry's own terms. */
export function disqualifyHelpText(sportType?: ScoresheetSportType): string {
  switch (sportType) {
    case 'AKC_SCENT_WORK':
    case 'AKC_SCENT_WORK_NATIONAL':
    case 'AKC_FASTCAT':
      return 'AKC: disqualify a dog that attacks a person in the search area, and file form AEDSQ1 within 72 hours. A dog that attacks another dog is Excused, not disqualified.';
    case 'UKC_NOSEWORK':
    case 'UKC_OBEDIENCE':
    case 'UKC_RALLY':
      return 'UKC: disqualify a dog that bites or attempts to bite any person (the handler included), or that attacks or attempts to attack. The reason goes in the official results book.';
    case 'ASCA_SCENT_DETECTION':
      return 'ASCA: disqualify a dog under the ASCA disqualification rules. Record the reason for the results.';
    default:
      return 'Disqualify only where the rules require it. State the reason for the official record.';
  }
}

export interface DisqualifyReasonProps {
  sportType?: ScoresheetSportType | undefined;
  reason: string;
  onReasonChange: (reason: string) => void;
}

/** The reason a judge must give before a DQ can be saved, with the registry's trigger rule. */
export const DisqualifyReason: React.FC<DisqualifyReasonProps> = ({
  sportType,
  reason,
  onReasonChange,
}) => (
  <div className="space-y-2 rounded-lg border-2 border-zinc-900 p-3 dark:border-zinc-300">
    <h3 className="text-base font-semibold">Disqualification Reason (required)</h3>
    <p className="text-sm text-muted-foreground" data-testid="dq-help">
      {disqualifyHelpText(sportType)}
    </p>
    <Input
      value={reason}
      onChange={e => onReasonChange(e.target.value)}
      placeholder="Briefly describe what happened"
      aria-label="Disqualification reason"
      aria-required="true"
      maxLength={500}
      data-testid="dq-reason-input"
    />
  </div>
);
