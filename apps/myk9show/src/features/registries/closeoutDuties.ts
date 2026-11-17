/**
 * What each registry owes at the end of a show, as facts about the registry rather than
 * strings scattered through the screens that happen to mention it (MYK9-1945).
 *
 * Only duties the app already acts on are listed: the judge's sign-off (AKC collects initials
 * on the marked catalog, UKC and ASCA a signature: `judge-sign-off`) and the results
 * submission (the app emails the AKC results file itself, so its record is a fact the app
 * knows; UKC and ASCA are filed outside the app and the secretary marks them: `secretary`).
 *
 * Deadlines (MYK9-2117) are verified against `docs/rulebooks/` and carry their source in
 * `supabase/functions/_shared/showCloseout/resultsDeadline.ts`: AKC 7 days after the event
 * (arrival, Scent Work Regulations ch. 3 sec. 37), ASCA 15 days after the event end (Gross
 * Receipts and Scent Trial Report forms). UKC is `null`: our copy of the rules names none, and
 * the list must never tell a secretary a date we have not verified.
 *
 * Still absent: fees and the paper AKC wants by mail, which are not verified
 * (`docs/plan-show-closeout.md`).
 */
import { RESULTS_DEADLINE_RULES } from '../../../../../supabase/functions/_shared/showCloseout/resultsDeadline';
import type { ResultsDeadlineRule } from '../../../../../supabase/functions/_shared/showCloseout/resultsDeadline';
import type { RegistryId } from './types';

export {
  RESULTS_DEADLINE_RULES,
  addCalendarDays,
  calendarDayInZone,
  describeResultsDeadline,
  formatDeadlineDay,
  lastTrialDay,
  resultsDeadlineFor,
} from '../../../../../supabase/functions/_shared/showCloseout/resultsDeadline';
export type { ResultsDeadlineRule };

export type RegistryCloseoutDutyKind = 'judge-sign-off' | 'results-submission';

export interface RegistryCloseoutDuty {
  /** Unique across registries, so a line can be told apart from another registry's. */
  key: string;
  kind: RegistryCloseoutDutyKind;
  /** The line as the list words it when it is still open. */
  label: string;
  /** Who records it: `app` when the app does it itself, `secretary` when she ticks it. */
  recordedBy: 'app' | 'secretary';
  /** Verified deadline, counted from the last trial day; `null` = none verified (never guess). */
  deadline: ResultsDeadlineRule | null;
}

const DUTIES: Readonly<Record<RegistryId, readonly RegistryCloseoutDuty[]>> = {
  AKC: [
    {
      key: 'akc-judge-initials',
      kind: 'judge-sign-off',
      label: "Judge's initials collected",
      recordedBy: 'secretary',
      deadline: null,
    },
    {
      key: 'akc-results-file',
      kind: 'results-submission',
      label: 'Results file sent to AKC',
      recordedBy: 'app',
      deadline: RESULTS_DEADLINE_RULES.AKC ?? null,
    },
  ],
  UKC: [
    {
      key: 'ukc-judge-signature',
      kind: 'judge-sign-off',
      label: 'Judge signature collected',
      recordedBy: 'secretary',
      deadline: null,
    },
    {
      key: 'ukc-paperwork-packet',
      kind: 'results-submission',
      label: 'UKC paperwork packet marked as submitted',
      recordedBy: 'secretary',
      deadline: RESULTS_DEADLINE_RULES.UKC ?? null,
    },
  ],
  ASCA: [
    {
      key: 'asca-judge-signature',
      kind: 'judge-sign-off',
      label: 'Judge signature collected',
      recordedBy: 'secretary',
      deadline: null,
    },
    {
      key: 'asca-online-upload',
      kind: 'results-submission',
      label: 'ASCA online results upload marked as submitted',
      recordedBy: 'secretary',
      deadline: RESULTS_DEADLINE_RULES.ASCA ?? null,
    },
  ],
};

export function getCloseoutDuties(registryId: RegistryId): readonly RegistryCloseoutDuty[] {
  return DUTIES[registryId];
}
