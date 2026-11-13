/**
 * Show-scoped sync targets, and the registry of shows a surface has open (MYK9-1923).
 *
 * The provider's untargeted pass runs with no show scope (`syncScopeId=''`), so on
 * its own it never downloads a show's entries or classes. A mounted show surface
 * registers its show here; the provider's existing scheduler (cadence, jitter,
 * visibility and online catch-up, in-flight guard) then adds one scoped
 * entries + classes pass per registered show. There is no timer in this module.
 */
import { replicatedTrialsTable } from '@/services/replication';
import type { UploadSyncTarget } from './ringsideUploadSyncTargets';

type TargetName = UploadSyncTarget['name'];

/** One token per mount; the show stays registered while any of its tokens is. */
const mountedShowTokens = new Map<string, string>();
let tokenSeq = 0;

/** Registers a mounted show surface. Two mounts of one show register it once. */
export function registerMountedShow(showId: string): string {
  tokenSeq += 1;
  const token = `${showId}#${tokenSeq}`;
  mountedShowTokens.set(token, showId);
  return token;
}

export function unregisterMountedShow(token: string): void {
  mountedShowTokens.delete(token);
}

/** The distinct shows currently registered. */
export function getMountedShowIds(): string[] {
  return [...new Set(mountedShowTokens.values())];
}

/** Test seam: restore the initial module state. */
export function resetMountedShows(): void {
  mountedShowTokens.clear();
}

/**
 * The scoped sync targets for the tables a broadcast (or the provider pass) named.
 * Classes replicate per trial, so a classes change is one target per trial of the
 * show. The entries and paperwork targets never depend on the classes lookup: a
 * device with no trials in its replica (cold, partly synced) still gets its entries
 * pass. `fullPass` is true when a classes change could not be named (no trials in
 * the replica, or the lookup failed): a scoped pass would sync none of it, so a
 * broadcast also asks for the bare full pass. paperwork_prints is scoped by show id.
 */
export async function targetsForTables(
  showId: string,
  tables: ReadonlySet<TargetName>
): Promise<{ targets: UploadSyncTarget[]; fullPass: boolean }> {
  const targets: UploadSyncTarget[] = [];
  let fullPass = false;
  if (tables.has('entries')) targets.push({ name: 'entries', scopeId: showId });
  if (tables.has('paperwork_prints')) targets.push({ name: 'paperwork_prints', scopeId: showId });
  if (tables.has('classes')) {
    try {
      const trials = await replicatedTrialsTable.getTrialsByShow(showId);
      for (const trial of trials) targets.push({ name: 'classes', scopeId: trial.id });
      fullPass = !trials.length;
    } catch {
      fullPass = true;
    }
  }
  return { targets, fullPass: fullPass || !targets.length };
}

const POLLED_TABLES: ReadonlySet<TargetName> = new Set<TargetName>(['entries', 'classes']);

/**
 * Entries + classes targets for every registered show, for the provider's untargeted
 * pass. The pass is already a full one, so `fullPass` is not needed here.
 */
export async function getMountedShowTargets(): Promise<UploadSyncTarget[]> {
  const perShow = await Promise.all(
    getMountedShowIds().map(showId => targetsForTables(showId, POLLED_TABLES))
  );
  return perShow.flatMap(({ targets }) => targets);
}
