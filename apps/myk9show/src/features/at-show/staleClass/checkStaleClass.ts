/**
 * Reads the replica and runs the stale-class rule (MYK9-1514) after a score submit, to
 * decide whether to ask. Confirming is a single server action that re-validates the dogs
 * itself (`ringside_complete_stale_class`), so nothing here is trusted at confirm time.
 */
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { logger } from '@/services/LoggingService';
import {
  detectStaleClass,
  type StaleClassCandidate,
  type StaleClassFields,
  type StaleEntryFields,
} from './detectStaleClass';
import { snoozedClassIds, useStaleClassPromptStore } from './staleClassPromptStore';

export interface StaleClassHit {
  trialId: string;
  candidate: StaleClassCandidate;
}

/** `null` follows the show's default (on); only an explicit false turns the prompt off. */
export async function evaluateStaleClass(
  scoredClassId: string,
  nowMs: number,
  options: { excludeClassIds?: ReadonlySet<string> } = {}
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
    if (c.id === scoredClassId || options.excludeClassIds?.has(c.id)) continue;
    if (c.classStatus !== 'in_progress') continue;
    if (!c.judgeId || c.judgeId !== scoredFields.judgeId) continue;
    entriesByClassId.set(c.id, await replicatedEntriesTable.getEntriesByClass(c.id));
  }

  const candidate = detectStaleClass({
    scoredClass: scoredFields,
    classes,
    entriesByClassId,
    nowMs,
    ...options,
  });
  return candidate ? { trialId, candidate } : null;
}

/** After a saved score: ask, unless snoozed. Never throws; scoring is not blocked on this. */
export async function checkForStaleClass(showId: string, scoredClassId: string): Promise<void> {
  try {
    const nowMs = Date.now();
    const excludeClassIds = snoozedClassIds(
      useStaleClassPromptStore.getState().snoozes,
      scoredClassId,
      nowMs
    );
    const hit = await evaluateStaleClass(scoredClassId, nowMs, { excludeClassIds });
    if (!hit) return;
    useStaleClassPromptStore
      .getState()
      .offer({ ...hit.candidate, showId, trialId: hit.trialId, scoredClassId }, nowMs);
  } catch (err) {
    logger.warn('Stale-class check failed', 'at-show', {}, err as Error);
  }
}
