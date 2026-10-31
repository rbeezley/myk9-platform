/**
 * Reads the replica and runs the stale-class rule (MYK9-1514). Used twice: after a
 * score submit to decide whether to ask, and again on "Mark absent & complete" so a
 * class is never completed from what the device believed minutes ago.
 */
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { logger } from '@/services/LoggingService';
import { syncAtShowData } from '../atShowDataAdapter';
import {
  detectStaleClass,
  type StaleClassCandidate,
  type StaleClassFields,
  type StaleEntryFields,
} from './detectStaleClass';
import { useStaleClassPromptStore, type StaleClassPrompt } from './staleClassPromptStore';

/** How long the confirm step waits for the server before judging on the local replica. */
const RECHECK_SYNC_TIMEOUT_MS = 8_000;

export interface StaleClassHit {
  trialId: string;
  candidate: StaleClassCandidate;
}

/** `null` follows the show's default (on); only an explicit false turns the prompt off. */
export async function evaluateStaleClass(
  scoredClassId: string,
  nowMs: number
): Promise<StaleClassHit | null> {
  const scored = await replicatedClassesTable.getClassById(scoredClassId);
  const trialId = scored?.trialId;
  if (!scored || !trialId) return null;
  const trial = await replicatedTrialsTable.getTrialById(trialId);
  if (trial?.autoCompleteStaleClasses === false) return null;

  const classes: StaleClassFields[] = (await replicatedClassesTable.getClassesByTrial(trialId)).map(
    c => ({
      id: c.id,
      name: c.name,
      level: c.level,
      judgeId: c.judgeId,
      classStatus: c.classStatus,
    })
  );
  const scoredFields = classes.find(c => c.id === scoredClassId);
  if (!scoredFields) return null;

  // Entries only for the classes that already pass the cheap clauses.
  const entriesByClassId = new Map<string, StaleEntryFields[]>();
  for (const c of classes) {
    if (c.id === scoredClassId || c.classStatus !== 'in_progress') continue;
    if (!c.judgeId || c.judgeId !== scoredFields.judgeId) continue;
    entriesByClassId.set(c.id, await replicatedEntriesTable.getEntriesByClass(c.id));
  }

  const candidate = detectStaleClass({
    scoredClass: scoredFields,
    classes,
    entriesByClassId,
    nowMs,
  });
  return candidate ? { trialId, candidate } : null;
}

/** After a saved score: ask, unless snoozed. Never throws; scoring is not blocked on this. */
export async function checkForStaleClass(showId: string, scoredClassId: string): Promise<void> {
  try {
    const nowMs = Date.now();
    const hit = await evaluateStaleClass(scoredClassId, nowMs);
    if (!hit) return;
    useStaleClassPromptStore
      .getState()
      .offer({ ...hit.candidate, showId, trialId: hit.trialId, scoredClassId }, nowMs);
  } catch (err) {
    logger.warn('Stale-class check failed', 'at-show', {}, err as Error);
  }
}

/**
 * Re-run the rule against synced state. Online: pull the show first (bounded), so a dog
 * scored on another device drops out. Offline or slow: the local replica, which still
 * holds every write this device has queued. Returns the fresh candidate, or null when
 * the class no longer qualifies.
 */
export async function recheckStaleClass(
  prompt: StaleClassPrompt
): Promise<StaleClassCandidate | null> {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        syncAtShowData(prompt.showId),
        new Promise<void>(resolve => {
          timer = setTimeout(resolve, RECHECK_SYNC_TIMEOUT_MS);
        }),
      ]);
    } catch (err) {
      logger.warn('Stale-class recheck could not sync first', 'at-show', {}, err as Error);
    } finally {
      clearTimeout(timer);
    }
  }
  const hit = await evaluateStaleClass(prompt.scoredClassId, Date.now());
  return hit && hit.candidate.classId === prompt.classId ? hit.candidate : null;
}
