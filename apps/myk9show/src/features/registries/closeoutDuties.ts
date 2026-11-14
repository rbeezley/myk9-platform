/**
 * What each registry owes at the end of a show, as facts about the registry rather than
 * strings scattered through the screens that happen to mention it (MYK9-1945).
 *
 * Only duties the app already acts on are listed: the judge's sign-off (AKC collects initials
 * on the marked catalog, UKC and ASCA a signature: `judge-sign-off`) and the results
 * submission (the app emails the AKC results file itself, so its record is a fact the app
 * knows; UKC and ASCA are filed outside the app and the secretary marks them: `secretary`).
 *
 * Deliberately absent: deadlines, fees and the paper AKC wants by mail. They are not verified
 * against the regulations yet (`docs/plan-show-closeout.md`, "Not yet verified"), and the list
 * must never tell a secretary what to mail on a guess. They join this table when they are.
 */
import type { RegistryId } from './types';

export type RegistryCloseoutDutyKind = 'judge-sign-off' | 'results-submission';

export interface RegistryCloseoutDuty {
  /** Unique across registries, so a line can be told apart from another registry's. */
  key: string;
  kind: RegistryCloseoutDutyKind;
  /** The line as the list words it when it is still open. */
  label: string;
  /** Who records it: `app` when the app does it itself, `secretary` when she ticks it. */
  recordedBy: 'app' | 'secretary';
}

const DUTIES: Readonly<Record<RegistryId, readonly RegistryCloseoutDuty[]>> = {
  AKC: [
    {
      key: 'akc-judge-initials',
      kind: 'judge-sign-off',
      label: "Judge's initials collected",
      recordedBy: 'secretary',
    },
    {
      key: 'akc-results-file',
      kind: 'results-submission',
      label: 'Results file sent to AKC',
      recordedBy: 'app',
    },
  ],
  UKC: [
    {
      key: 'ukc-judge-signature',
      kind: 'judge-sign-off',
      label: 'Judge signature collected',
      recordedBy: 'secretary',
    },
    {
      key: 'ukc-paperwork-packet',
      kind: 'results-submission',
      label: 'UKC paperwork packet marked as submitted',
      recordedBy: 'secretary',
    },
  ],
  ASCA: [
    {
      key: 'asca-judge-signature',
      kind: 'judge-sign-off',
      label: 'Judge signature collected',
      recordedBy: 'secretary',
    },
    {
      key: 'asca-online-upload',
      kind: 'results-submission',
      label: 'ASCA online results upload marked as submitted',
      recordedBy: 'secretary',
    },
  ],
};

export function getCloseoutDuties(registryId: RegistryId): readonly RegistryCloseoutDuty[] {
  return DUTIES[registryId];
}
