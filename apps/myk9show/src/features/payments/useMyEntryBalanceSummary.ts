import { useAuthContext } from '@/hooks/useAuthContext';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { useAccountEntries, type AccountEntriesRead } from '@/hooks/queries/useAccountEntries';
import {
  mapEntryRowToBalanceSource,
  summarizeEntryBalances,
  type EntryBalanceRawRow,
  type EntryBalanceSummary,
} from './entryBalanceSummary';

type OwnEntryBalanceRow = EntryBalanceRawRow & {
  registration_id?: string | null;
};

/** Module-level so React Query does not re-run it on every render. */
function selectBalanceSummary(read: AccountEntriesRead): EntryBalanceSummary {
  const summary = summarizeEntryBalances(
    read.rows.map(row => mapEntryRowToBalanceSource(row as OwnEntryBalanceRow))
  );
  // Carry the provenance, do not bury it. This is the exhibitor's money
  // surface: an amount due computed from rows the server never confirmed —
  // a hard-deleted entry still sitting in the per-show snapshot, say — is a
  // phantom debt, and the page needs to be able to tell that it is showing
  // saved data rather than stating a figure as fact.
  return read.degraded ? { ...summary, stale: true } : summary;
}

/**
 * The exhibitor's amount due, projected from the shared account-entries read
 * (MYK9-563 item 3) — the same rows and the same cache entry My Shows, the
 * ringside chooser and the Browse Shows "entered" tab read.
 */
export function useMyEntryBalanceSummary() {
  const { user, userWithRoles } = useAuthContext();
  const legacyPersonId = useCurrentUserPersonId();
  const personId = legacyPersonId ?? userWithRoles?.databaseUserId ?? null;

  return useAccountEntries(personId, selectBalanceSummary, {
    enabled: Boolean(user?.id),
  });
}
