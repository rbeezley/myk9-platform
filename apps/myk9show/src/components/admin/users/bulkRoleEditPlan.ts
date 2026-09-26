/**
 * UI logic for the bulk role-edit panel: who among the selection holds each role
 * now, which Add / Keep / Remove choices can change anything, and how a plan
 * from bulkRolePlanner reads in plain words.
 *
 * It decides NOTHING about what will be written — that is bulkRolePlanner's
 * job alone. `summarizeBulkPlan` only renders a plan the runner will execute
 * unchanged, so the summary cannot promise what the runner will not do.
 */

import { CLUB_SCOPED_ROLES, LOCKED_ROLES, ROLE_LABELS } from '@/services/rbac/roleUiConstants';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';
import type { BulkRolePlan, RoleAssignment } from './bulkRolePlanner';

export type RoleChoice = 'add' | 'keep' | 'remove';

export interface RoleHolding {
  role: string;
  /** How many of the selected people hold the role now (any scope). */
  holders: number;
}

export function nameOf(user: SelectedUser): string {
  return `${user.user.firstName ?? ''} ${user.user.lastName ?? ''}`.trim() || user.id;
}

export function roleHoldings(selected: SelectedUser[], roles: readonly string[]): RoleHolding[] {
  return roles.map(role => ({
    role,
    holders: selected.filter(item => (item.user.roles ?? []).some(r => r === role)).length,
  }));
}

/** "all 4", "none", "2 of 4" — the "who has it now" column. */
export function describeHolding(holders: number, total: number): string {
  if (holders === 0) return 'none';
  if (holders === total) return total === 1 ? 'has it' : `all ${total}`;
  return `${holders} of ${total}`;
}

/**
 * A choice that cannot change anything collapses to Keep: Add when everyone
 * already holds a non-club role, Remove when nobody holds it, and any change to
 * a locked role. Club-scoped roles stay addable even when everyone holds one —
 * the grant may be for a different club.
 */
export function effectiveChoice(
  role: string,
  choice: RoleChoice,
  holders: number,
  total: number
): RoleChoice {
  if (LOCKED_ROLES.has(role)) return 'keep';
  if (choice === 'add' && holders === total && !CLUB_SCOPED_ROLES.has(role)) return 'keep';
  if (choice === 'remove' && holders === 0) return 'keep';
  return choice;
}

export interface ChosenChanges {
  add: string[];
  remove: string[];
  /** True when a club-scoped role is being added or removed. */
  needsClubs: boolean;
}

export function chosenChanges(
  choices: Record<string, RoleChoice>,
  holdings: RoleHolding[],
  total: number
): ChosenChanges {
  const add: string[] = [];
  const remove: string[] = [];
  for (const { role, holders } of holdings) {
    const choice = effectiveChoice(role, choices[role] ?? 'keep', holders, total);
    if (choice === 'add') add.push(role);
    if (choice === 'remove') remove.push(role);
  }
  const needsClubs = [...add, ...remove].some(role => CLUB_SCOPED_ROLES.has(role));
  return { add, remove, needsClubs };
}

export interface SummaryLine {
  tone: 'add' | 'remove' | 'note';
  text: string;
}

function people(count: number): string {
  return count === 1 ? '1 person' : `${count} people`;
}

function listNames(names: string[]): string {
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}

/**
 * The "What will happen" lines — a rendering of `plan`, nothing more. A chosen
 * change the plan does not carry out is stated as such, never implied.
 */
export function summarizeBulkPlan(
  plan: BulkRolePlan,
  chosen: ChosenChanges,
  selected: SelectedUser[],
  clubCount: number
): SummaryLine[] {
  const nameById = new Map(selected.map(item => [item.id, nameOf(item)]));
  const label = (role: string) => ROLE_LABELS[role] ?? role;
  const clubWord = clubCount === 1 ? 'club' : 'clubs';
  const scope = (role: string) =>
    CLUB_SCOPED_ROLES.has(role) ? ` for ${clubCount} ${clubWord}` : '';
  const namesFor = (userIds: Iterable<string>) =>
    listNames([...new Set(userIds)].map(id => nameById.get(id) ?? id));

  const lines: SummaryLine[] = [];
  for (const role of chosen.remove) {
    const losing = plan.people.filter(p => p.remove.some(a => a.role === role)).map(p => p.userId);
    const kept = plan.leftUnchanged.filter(a => a.role === role);
    if (losing.length > 0) {
      lines.push({
        tone: 'remove',
        text: `Remove ${label(role)}${scope(role)} from ${namesFor(losing)}`,
      });
    } else if (kept.length === 0) {
      const where = CLUB_SCOPED_ROLES.has(role) ? ` for the chosen ${clubWord}` : '';
      lines.push({
        tone: 'note',
        text: `Nobody selected holds ${label(role)}${where} — nothing to remove`,
      });
    }
    if (kept.length > 0) {
      lines.push({
        tone: 'note',
        text: `${label(role)} stays for ${namesFor(kept.map((a: RoleAssignment) => a.userId))}: limited to one show or with an end date`,
      });
    }
  }
  for (const role of chosen.add) {
    const gaining = plan.people.filter(p => p.add.some(g => g.role === role)).map(p => p.userId);
    lines.push(
      gaining.length > 0
        ? {
            tone: 'add',
            text: `Add ${label(role)}${scope(role)} to ${people(new Set(gaining).size)}`,
          }
        : { tone: 'note', text: `Everyone selected already has ${label(role)}${scope(role)}` }
    );
  }
  return lines;
}
