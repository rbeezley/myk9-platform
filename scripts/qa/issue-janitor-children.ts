/**
 * Parent-issue handling for the issue janitor (MYK9-1434). A parent's merge evidence
 * lives on its children, so it has no branch or PR of its own and must never read as
 * "unclaimed". Pure helpers; the planner calls them before any PR/branch disposition.
 */
import type { BoardIssue, PlanEntry } from './issue-janitor-types.ts';

const CLOSED_STATES = new Set(['done', 'canceled', 'cancelled', 'duplicate']);

export const isClosedState = (state: string): boolean => CLOSED_STATES.has(state.toLowerCase());

/** Fails the run loudly: a missing `children` must never default to `[]` (that hides every parent). */
export function assertChildren(issues: BoardIssue[]): void {
  for (const issue of issues) {
    if (!Array.isArray(issue.children)) {
      throw new Error(
        `board issue ${issue.id} has no "children" array; the board export must list each issue's children (use [] for none)`
      );
    }
  }
}

/** A `skip` or `fresh-read` entry when the issue has children, else null (current behaviour). */
export function planParent(
  issue: BoardIssue,
  make: {
    skip: (id: string, reason: string) => PlanEntry;
    freshRead: (id: string, reason: string) => PlanEntry;
  }
): PlanEntry | null {
  if (issue.children.length === 0) return null;
  const open = issue.children.filter(c => !isClosedState(c.state));
  if (open.length) {
    return make.skip(
      issue.id,
      `waiting on children: ${open.map(c => `${c.id} (${c.state})`).join(', ')}`
    );
  }
  return make.freshRead(issue.id, 'all children closed');
}
