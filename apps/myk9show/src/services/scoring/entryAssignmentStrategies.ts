/**
 * Entry Assignment Strategies
 *
 * Functions for creating entry assignments using different strategies
 * (sequential, random, optimized, manual).
 */

import type { EntryAssignment, AssignmentStrategy, JudgeSession } from './judge-workflow-types';

/**
 * Create sequential assignments (entries in original order)
 */
export function createSequentialAssignments(
  entries: string[],
  judgeId: string
): EntryAssignment[] {
  return entries.map((entryId, index) => ({
    entryId,
    judgeId,
    assignedAt: new Date(),
    priority: index + 1,
    status: 'assigned'
  }));
}

/**
 * Create random assignments (shuffled order)
 */
export function createRandomAssignments(
  entries: string[],
  judgeId: string
): EntryAssignment[] {
  const shuffled = [...entries].sort(() => Math.random() - 0.5);
  return createSequentialAssignments(shuffled, judgeId);
}

/**
 * Create optimized assignments based on judge performance and entry complexity
 * Currently uses sequential assignment as a fallback
 */
export async function createOptimizedAssignments(
  entries: string[],
  session: JudgeSession
): Promise<EntryAssignment[]> {
  // Future: Optimize based on judge performance, entry complexity, etc.
  // For now, use sequential assignment
  return createSequentialAssignments(entries, session.judgeId);
}

/**
 * Get assignments based on strategy
 */
export async function getAssignmentsByStrategy(
  entries: string[],
  strategy: AssignmentStrategy,
  session: JudgeSession,
  existingAssignments?: EntryAssignment[]
): Promise<EntryAssignment[]> {
  switch (strategy) {
    case 'sequential':
      return createSequentialAssignments(entries, session.judgeId);
    case 'random':
      return createRandomAssignments(entries, session.judgeId);
    case 'optimized':
      return createOptimizedAssignments(entries, session);
    case 'manual':
      // Manual assignments would be set externally
      return existingAssignments || [];
    default:
      return createSequentialAssignments(entries, session.judgeId);
  }
}

/**
 * Filter assignments for a specific judge
 */
export function filterAssignmentsForJudge(
  assignments: EntryAssignment[],
  judgeId: string
): EntryAssignment[] {
  return assignments.filter(a => a.judgeId === judgeId);
}

/**
 * Get entry IDs from assignments
 */
export function getEntryIdsFromAssignments(assignments: EntryAssignment[]): string[] {
  return assignments.map(a => a.entryId);
}
