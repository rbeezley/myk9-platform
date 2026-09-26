/**
 * Pure logic behind the bulk role-edit panel: who holds each role now, what the
 * admin's per-role Add / Keep / Remove choices turn into, and how that reads in
 * plain words before anything is written.
 *
 * The plan runs through the existing per-user runner (bulkRoleRunner.ts) as
 * ordered steps — remove first, then add — so club scoping, the
 * show-limited/expiring-grant protection and the canonical-role validation all
 * stay on the one path they already have.
 */

import { CLUB_SCOPED_ROLES, LOCKED_ROLES, ROLE_LABELS } from '@/services/rbac/roleUiConstants';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';
import type { BulkRoleSubmitConfig } from './bulkRoleRunner';

export type RoleChoice = 'add' | 'keep' | 'remove';

export interface RoleHolding {
  role: string;
  /** How many of the selected people hold the role now. */
  holders: number;
  /** Their ids and names (aligned), for the "Remove X from …" line. */
  holderIds: string[];
  holderNames: string[];
}

/**
 * One active grant of a club-scoped role, as the runner sees it. A role name
 * alone cannot say WHICH club a Secretary grant is for, and the runner revokes
 * only grants for the chosen clubs — so a removal summary must read these.
 */
export interface ClubGrant {
  userId: string;
  role: string;
  clubId: string | null;
  /** Limited to one show or with an end date — the runner never revokes these. */
  protected: boolean;
}

export function nameOf(user: SelectedUser): string {
  return `${user.user.firstName ?? ''} ${user.user.lastName ?? ''}`.trim() || user.id;
}

export function roleHoldings(selected: SelectedUser[], roles: readonly string[]): RoleHolding[] {
  return roles.map(role => {
    const holding = selected.filter(item => (item.user.roles ?? []).some(r => r === role));
    return {
      role,
      holders: holding.length,
      holderIds: holding.map(item => item.id),
      holderNames: holding.map(nameOf),
    };
  });
}

/** "all 4", "none", "2 of 4" — the "who has it now" column. */
export function describeHolding(holders: number, total: number): string {
  if (holders === 0) return 'none';
  if (holders === total) return total === 1 ? 'has it' : `all ${total}`;
  return `${holders} of ${total}`;
}

/**
 * A choice that cannot change anything collapses to Keep: Add when everyone
 * already holds a non-club role, Remove when nobody does, and any change to a
 * locked role. Club-scoped roles stay addable even when everyone holds one —
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

export interface RoleEditPlan {
  add: string[];
  remove: string[];
  /** True when a club-scoped role is being added or removed. */
  needsClubs: boolean;
}

export function buildRoleEditPlan(
  choices: Record<string, RoleChoice>,
  holdings: RoleHolding[],
  total: number
): RoleEditPlan {
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

/**
 * Remove before add, so a role moved between clubs never has both grants live
 * at once and a failure mid-way leaves the narrower state.
 */
export function planToSteps(plan: RoleEditPlan, clubIds: string[]): BulkRoleSubmitConfig[] {
  const steps: BulkRoleSubmitConfig[] = [];
  if (plan.remove.length > 0) steps.push({ mode: 'remove', roleNames: plan.remove, clubIds });
  if (plan.add.length > 0) steps.push({ mode: 'add', roleNames: plan.add, clubIds });
  return steps;
}

function people(count: number): string {
  return count === 1 ? '1 person' : `${count} people`;
}

function listNames(names: string[]): string {
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}

export interface SummaryLine {
  tone: 'add' | 'remove' | 'note';
  text: string;
}

/** True when a removal needs the selection's club grants before it can be stated. */
export function needsClubGrants(plan: RoleEditPlan): boolean {
  return plan.remove.some(role => CLUB_SCOPED_ROLES.has(role));
}

/**
 * The "What will happen" lines. Club-scoped lines name how many clubs, and a
 * club-scoped removal names only the people the runner will actually change:
 * holders of an unprotected grant for one of `clubIds`. Until `clubGrants` is
 * known it names nobody.
 */
export function summarizePlan(
  plan: RoleEditPlan,
  holdings: RoleHolding[],
  total: number,
  clubIds: string[],
  clubGrants?: ClubGrant[]
): SummaryLine[] {
  const byRole = new Map(holdings.map(h => [h.role, h]));
  const clubCount = clubIds.length;
  const clubWord = clubCount === 1 ? 'club' : 'clubs';
  const clubs = (role: string) =>
    CLUB_SCOPED_ROLES.has(role) ? ` for ${clubCount} ${clubWord}` : '';
  const label = (role: string) => ROLE_LABELS[role] ?? role;

  const lines: SummaryLine[] = [];
  for (const role of plan.remove) {
    const holding = byRole.get(role);
    let names = holding?.holderNames ?? [];
    if (CLUB_SCOPED_ROLES.has(role)) {
      if (!clubGrants) {
        lines.push({
          tone: 'note',
          text: `Checking who holds ${label(role)} for the chosen ${clubWord}…`,
        });
        continue;
      }
      const affected = new Set(
        clubGrants
          .filter(g => g.role === role && !g.protected && !!g.clubId && clubIds.includes(g.clubId))
          .map(g => g.userId)
      );
      names = (holding?.holderIds ?? [])
        .map((id, index) => (affected.has(id) ? holding?.holderNames[index] : undefined))
        .filter((name): name is string => !!name);
      if (names.length === 0) {
        lines.push({
          tone: 'note',
          text: `Nobody selected holds ${label(role)} for the chosen ${clubWord} — nothing to remove`,
        });
        continue;
      }
    }
    lines.push({
      tone: 'remove',
      text: `Remove ${label(role)}${clubs(role)} from ${listNames(names)}`,
    });
  }
  for (const role of plan.add) {
    const lacking = total - (byRole.get(role)?.holders ?? 0);
    const who = CLUB_SCOPED_ROLES.has(role) ? people(total) : people(lacking);
    lines.push({ tone: 'add', text: `Add ${label(role)}${clubs(role)} to ${who}` });
  }
  return lines;
}
