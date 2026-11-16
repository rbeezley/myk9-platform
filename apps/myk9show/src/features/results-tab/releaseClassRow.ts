/**
 * Releasing ONE class from the Results tab (MYK9-1264, MYK9-1031), as a function that reports what
 * happened instead of toasting. The single-class Release button and "Release N classes"
 * (MYK9-2072) both call `releaseClassRow`, so there is one write path and one set of preflights.
 */
import { readServerResultsVerifiedAt } from '@/features/show-map/resultsVerifiedMutations';
import type { ResultsClassRow } from './buildResultsClassRows';
import { classHasUnsyncedScores } from './useClassUnsyncedScores';

export const OFFLINE_RELEASE_REASON = 'Connect to release from here';

/** What a class's tick box does: a live box, a disabled one that says why, or no box at all. */
export type ReleaseTick =
  { kind: 'tick' } | { kind: 'disabled'; reason: string } | { kind: 'none' };

/**
 * The one rule for "this class can be released now", shared by the single-class button and the tick
 * boxes. A checked class releases; an unchecked, completed class with results on this device is
 * checked and released in one go. A released class, or one still to coin-flip or finish scoring,
 * has no Release.
 */
export function canReleaseRow(row: ResultsClassRow): boolean {
  if (row.releasedAt) return false;
  if (row.phase === 'ready-to-release') return true;
  return row.phase === 'needs-checking' && row.statusCompleted && row.resultsCanonical !== null;
}

export function getReleaseTick(row: ResultsClassRow, online: boolean): ReleaseTick {
  if (!canReleaseRow(row)) return { kind: 'none' };
  return online ? { kind: 'tick' } : { kind: 'disabled', reason: OFFLINE_RELEASE_REASON };
}

export type ReleaseOutcome =
  /** Queued (`announce`) or nothing left to do because the class was already released. */
  | { kind: 'released'; announce: boolean }
  /** Not attempted or stopped quietly; `reason` is the plain-language why when there is one. */
  | { kind: 'skipped'; reason: string | null }
  /** Stopped with a message for the secretary. `toasted`: the verify mutation already said so. */
  | { kind: 'failed'; message: string; toasted?: boolean };

export interface ReleaseClassRowDeps {
  showId: string;
  verification: {
    verifyAsync: (input: {
      classId: string;
      trialId: string;
      showId: string;
      canonical: string;
    }) => Promise<unknown>;
    refreshClass: (trialId: string) => void;
  };
  release: {
    mutate: (
      input: { classIds: string[]; showId: string },
      options: {
        onSuccess: (result: { released: string[] }) => void;
        onError: () => void;
      }
    ) => void;
  };
  /** True once the check was taken back (Undo) since the click that started this release. */
  checkChanged: () => boolean;
  /** Why the class cannot be checked on this device right now (class row syncing), or null. */
  verifyBlockedReason: string | null;
  /** Why Release is held back (offline, scores still syncing), or null. */
  releaseBlockedReason: string | null;
}

const RETRY_RELEASE = 'Could not release the results. Try Release again.';

export async function releaseClassRow(
  row: ResultsClassRow,
  deps: ReleaseClassRowDeps
): Promise<ReleaseOutcome> {
  // From Needs checking the tap first saves the check for the results the secretary is looking at
  // (the server refuses it if they moved: MK015), then releases through the same preflight as a
  // class that was already checked. The replica's phase is not awaited between the two: the
  // server's own answer below is what decides.
  const verifyFirst = row.phase === 'needs-checking';
  if (verifyFirst) {
    if (!row.statusCompleted || row.resultsCanonical === null) {
      return { kind: 'skipped', reason: null };
    }
    if (deps.verifyBlockedReason !== null) {
      return { kind: 'skipped', reason: deps.verifyBlockedReason };
    }
  } else if (row.phase !== 'ready-to-release') {
    return { kind: 'skipped', reason: null };
  }
  if (deps.releaseBlockedReason !== null) {
    return { kind: 'skipped', reason: deps.releaseBlockedReason };
  }
  let checked = !verifyFirst;
  // After the check is saved, a refusal must not read as if nothing happened.
  const refuse = (message: string): ReleaseOutcome => ({
    kind: 'failed',
    message:
      checked && verifyFirst
        ? `${message.replace(/\.$/, '')}. The scores are checked, not released yet.`
        : message,
  });
  if (verifyFirst) {
    if (row.resultsCanonical === null) return { kind: 'skipped', reason: null };
    try {
      await deps.verification.verifyAsync({
        classId: row.id,
        trialId: row.trialId,
        showId: deps.showId,
        canonical: row.resultsCanonical,
      });
    } catch {
      // The mutation already told the user why (MK015 included) and refetched the entries.
      return { kind: 'failed', message: 'The scores could not be checked.', toasted: true };
    }
    checked = true;
    // Already released: the check was all this class was missing.
    if (row.releasedAt) return { kind: 'released', announce: false };
  }
  // Release in this tab waits for the check (the server does not, by design). The replica's copy of
  // the check is only a hint: the click is decided by a fresh read on the server.
  let verifiedAt: string | null;
  try {
    verifiedAt = await readServerResultsVerifiedAt(row.id);
  } catch {
    return refuse('Could not check this class. Try again.');
  }
  // A correction can land while the server was being asked: the answer then describes older
  // results. Look again, directly, before anything is queued.
  try {
    if (await classHasUnsyncedScores(row.id)) {
      return refuse('Waiting for score changes to be sent');
    }
  } catch {
    return refuse('Could not check this class. Try again.');
  }
  // The check was taken back (Undo) at any point since the click: the read is stale. Compared after
  // the LAST await, immediately before anything is queued.
  if (deps.checkChanged()) {
    return {
      kind: 'failed',
      message: 'The check was just changed. Check the class and try again.',
    };
  }
  if (!verifiedAt) {
    deps.verification.refreshClass(row.trialId);
    return { kind: 'failed', message: 'The scores changed, so this class needs checking again.' };
  }
  return new Promise<ReleaseOutcome>(resolve => {
    deps.release.mutate(
      { classIds: [row.id], showId: deps.showId },
      {
        onSuccess: ({ released }) =>
          resolve(
            released.length > 0 ? { kind: 'released', announce: true } : refuse(RETRY_RELEASE)
          ),
        onError: () => resolve(refuse(RETRY_RELEASE)),
      }
    );
  });
}
