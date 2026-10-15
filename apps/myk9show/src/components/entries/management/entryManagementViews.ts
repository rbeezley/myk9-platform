/**
 * The eight views in the Entries tab's Show: menu (MYK9-795; `EntryManagementShowMenu`): the four
 * registration queues, which can be checked together, and the four exception lists.
 *
 * The four registration queues carry a live count from `useEntryManagementCockpit`
 * (`cockpit.queueCounts`) — unchanged data, just surfaced on the new tabs.
 * Pulls and Move-ups counts come from data the page already has or fetches
 * cheaply. Waitlist's count is intentionally optional: see the PR description
 * for why it's scoped down rather than adding a duplicate fetch or a big
 * `WaitlistManagementPage` data-hook restructure.
 */
import type { ListView } from '@/components/list-toolkit';
import type { ShowRegistrationQueueCounts } from './showRegistrationProjection';

export interface EntryManagementViewCounts {
  queueCounts: ShowRegistrationQueueCounts;
  pulls: number;
  /** Omitted (no numeric badge) when unknown — still loading, or the read failed. */
  moveUps: number | undefined;
  /** Omitted (no numeric badge) when not cheaply available — see module doc. */
  waitlist?: number;
  /**
   * Entries awaiting a registration number (MYK9-1162). Omitted (no numeric badge) while the
   * trials or dogs it derives from are still loading, rather than a confident 0.
   */
  registrationNeeded?: number | undefined;
}

export function buildEntryManagementViews(counts: EntryManagementViewCounts): ListView[] {
  return [
    { id: 'needs-review', label: 'Needs review', count: counts.queueCounts['needs-review'] },
    {
      id: 'missing-information',
      label: 'Missing info',
      count: counts.queueCounts['missing-information'],
    },
    { id: 'payment-due', label: 'Payment due', count: counts.queueCounts['payment-due'] },
    { id: 'all', label: 'All', count: counts.queueCounts.all },
    {
      id: 'waitlist',
      label: 'Waitlist',
      ...(counts.waitlist !== undefined ? { count: counts.waitlist } : {}),
    },
    { id: 'pulls', label: 'Pulls', count: counts.pulls },
    {
      id: 'move-ups',
      label: 'Move-ups',
      ...(counts.moveUps !== undefined ? { count: counts.moveUps } : {}),
    },
    {
      id: 'registration-needed',
      label: 'Registration number needed',
      ...(counts.registrationNeeded !== undefined ? { count: counts.registrationNeeded } : {}),
    },
  ];
}
