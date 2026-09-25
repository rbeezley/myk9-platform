/**
 * Re-read My Shows once when a CACHED identity is confirmed (MYK9-738).
 *
 * A cold offline boot reads the replica under the cached person id while the
 * authoritative lookup is unresolved (MYK9-601). When signal returns, that
 * lookup confirms the SAME id, so the `user::person` identity key never
 * changes and nothing else re-reads: My Shows stayed on the offline read until
 * a manual reload. This hook re-reads exactly once per confirmation, and only
 * when the read the page holds was not confirmed by the server:
 *
 * - the last completed read was unconfirmed → re-read now;
 * - a read is still in flight → re-read when it lands, if it lands
 *   unconfirmed (a timed-out read on captive Wi-Fi lands as a replica read
 *   AFTER the network came back);
 * - the read was server-confirmed (an ordinary online boot) → nothing.
 *
 * @module MyEntriesPage/modules/useRereadOnIdentityConfirmation
 */

import { useCallback, useEffect, useRef } from 'react';
import type { UserEntriesSource } from '@/services/database/entries';

export type EntriesReadOutcome = UserEntriesSource | 'error';

const isServerConfirmed = (outcome: EntriesReadOutcome) => outcome.startsWith('confirmed');

export function useRereadOnIdentityConfirmation({
  identityKey,
  identityConfirmed,
  reload,
}: {
  /** `user::person` the page reads for; a change means another account. */
  identityKey: string | null;
  identityConfirmed: boolean;
  reload: () => Promise<void>;
}) {
  /** Outcome of the last completed CURRENT read; null while none has landed. */
  const lastOutcomeRef = useRef<EntriesReadOutcome | null>(null);
  /** Confirmation arrived while a read was in flight: judge that read when it lands. */
  const pendingRef = useRef(false);
  /** Whether the CURRENT read has landed. A newer read supersedes an older one. */
  const currentReadLandedRef = useRef(false);
  const wasConfirmedRef = useRef(identityConfirmed);
  const reloadRef = useRef(reload);

  // An account switch: nothing the previous identity read counts any more.
  // An effect, not a render-time write (react-hooks/refs): reads for the old
  // identity are already fenced out by useMyEntriesData's generation, and the
  // new identity's first read cannot land before this runs.
  useEffect(() => {
    lastOutcomeRef.current = null;
    pendingRef.current = false;
    currentReadLandedRef.current = false;
  }, [identityKey]);

  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  useEffect(() => {
    const becameConfirmed = identityConfirmed && !wasConfirmedRef.current;
    wasConfirmedRef.current = identityConfirmed;
    if (!becameConfirmed) return;
    // Judge the read in flight, not the last one that landed: an earlier
    // confirmed read says nothing about a refresh still running (round-2
    // review of #2434).
    if (!currentReadLandedRef.current) {
      pendingRef.current = true;
      return;
    }
    const last = lastOutcomeRef.current;
    if (last !== null && !isServerConfirmed(last)) void reloadRef.current();
  }, [identityConfirmed]);

  /** Call when a read starts; it supersedes any read still in flight. */
  const recordStart = useCallback(() => {
    currentReadLandedRef.current = false;
  }, []);

  /** Call once per completed read that is still the current one. */
  const recordOutcome = useCallback((outcome: EntriesReadOutcome) => {
    lastOutcomeRef.current = outcome;
    currentReadLandedRef.current = true;
    if (!pendingRef.current) return;
    pendingRef.current = false;
    if (!isServerConfirmed(outcome)) void reloadRef.current();
  }, []);

  return { recordStart, recordOutcome };
}
