import type { ShortReplicaReport } from './types';

/** What a counted full download found, for the app to report (MYK9-2254). */
export interface ShortReplicaObservation {
  tableName: string;
  scope: string | undefined;
  /** null: this scope's download is whole against the server's count. */
  short: ShortReplicaReport | null;
}

export type ShortReplicaReporter = (observation: ShortReplicaObservation) => void;

let reporter: ShortReplicaReporter | null = null;

/**
 * The app registers ONE reporter at startup. Every table sync, whoever called
 * it, hands its counted full-sync verdict here, so reporting does not depend on
 * which caller ran the sync. The engine stays logger-free.
 */
export function setShortReplicaReporter(next: ShortReplicaReporter | null): void {
  reporter = next;
}

/** A reporter that throws must never fail the sync that was observed. */
export function observeShortReplica(observation: ShortReplicaObservation): void {
  try {
    reporter?.(observation);
  } catch {
    // Reporting is best effort.
  }
}

/**
 * A result whose only failure is a download that stayed short of the server's
 * count. It is a failure (readiness stays false) but never a volunteer-facing
 * warning: the offline line and the checklist already say the copy is incomplete.
 */
export function isShortOnlyFailure(result: unknown): boolean {
  const { success, shortReplica } = (result ?? {}) as { success?: boolean; shortReplica?: unknown };
  return success === false && shortReplica !== undefined && shortReplica !== null;
}
