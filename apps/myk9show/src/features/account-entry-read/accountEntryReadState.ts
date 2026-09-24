import type { PersonIdentityState } from '@/context/authContextTypes';
import type { UserEntriesSource } from '@/services/database/entries';

/** The truth state of an account-scoped entry read. */
export type AccountEntryReadState =
  | 'identity-unresolved'
  | 'identity-missing'
  | 'read-pending'
  | 'confirmed'
  | 'unconfirmed'
  | 'error';

export interface DeriveAccountEntryReadStateInput {
  hasUser: boolean;
  personId: string | null;
  personIdentityState: PersonIdentityState;
  isPending: boolean;
  isError: boolean;
  source?: UserEntriesSource | undefined;
}

/**
 * Derive account-entry truth in precedence order. A cached person id is enough
 * to read the replica even while the authoritative identity lookup is still
 * unresolved; a missing source after that read is never confirmation.
 */
export function deriveAccountEntryReadState({
  hasUser,
  personId,
  personIdentityState,
  isPending,
  isError,
  source,
}: DeriveAccountEntryReadStateInput): AccountEntryReadState {
  if (!hasUser || (!personId && personIdentityState === 'unresolved')) {
    return 'identity-unresolved';
  }

  if (personIdentityState === 'missing') return 'identity-missing';
  if (!personId) return 'identity-unresolved';
  if (isError) return 'error';
  if (isPending) return 'read-pending';
  if (source === 'confirmed' || source === 'confirmed-move-up-link-unavailable') {
    return 'confirmed';
  }
  return 'unconfirmed';
}

/** An empty result is safe to state only after an authoritative read. */
export function canClaimConfirmedEmpty(state: AccountEntryReadState): boolean {
  return state === 'confirmed';
}

/** Existing rows remain useful when a read is degraded, but not while identity is unknown. */
export function canRenderKnownRows(state: AccountEntryReadState, rowCount: number): boolean {
  return rowCount > 0 && (state === 'confirmed' || state === 'unconfirmed' || state === 'error');
}
