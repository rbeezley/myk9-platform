import { collectLunchCandidates } from './lunchCandidates';
import {
  buildLunchOrderList,
  LUNCH_ROLES,
  lunchRoleLabel,
  type LunchListItem,
  type LunchOrderRow,
  type LunchRole,
} from './lunchOrders';
import type { JudgeOnDay } from './judgesOnDays';
import type { ShowOfficials } from '@/hooks/queries/useShowOfficials';
import type { VolunteerOnDay } from './useLunchOrders';

export interface HospitalityRoleGroup {
  role: LunchRole;
  label: string;
  count: number;
  names: string[];
}

/** One calendar date of the Hospitality plan: every trial held that date, merged. */
export interface HospitalityPlanDay {
  /** The calendar date (YYYY-MM-DD) shared by `trialIds`; '' when a trial has no date. */
  date: string;
  trialIds: string[];
  total: number;
  roles: HospitalityRoleGroup[];
  /** Only people with a lunch order or a dietary note typed; everyone else is in `roles`. */
  orders: LunchListItem[];
}

/** What one trial contributes to its date. */
export interface HospitalityTrialInput {
  trialId: string;
  saved: readonly LunchOrderRow[];
  judges: readonly JudgeOnDay[];
  officials: ShowOfficials | undefined;
  volunteers: readonly VolunteerOnDay[];
}

function joinDistinct(values: Array<string | null>): string | null {
  const distinct = [...new Set(values.map(v => v?.trim()).filter((v): v is string => Boolean(v)))];
  return distinct.length > 0 ? distinct.join('; ') : null;
}

/**
 * The same person saved in two trials of one date becomes one row. Identity follows the list:
 * person id when there is one, otherwise the name. Differing orders are all kept, joined.
 */
function mergeSavedRows(rows: readonly LunchOrderRow[]): LunchOrderRow[] {
  const groups = new Map<string, LunchOrderRow[]>();
  for (const row of rows) {
    const key = row.person_id ? `p:${row.person_id}` : `n:${row.name.trim().toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map(group => ({
    ...group[0]!,
    lunch_order: joinDistinct(group.map(row => row.lunch_order)),
    dietary_note: joinDistinct(group.map(row => row.dietary_note)),
  }));
}

/**
 * The plan for one calendar date. It reuses the Lunch orders list's own merge (the same
 * candidates, the same one-person-once priority), across every trial held that date, so a
 * steward working two trials the same day is counted once. Headcount is everyone assigned plus
 * anyone added to a list. Exhibitors only ever appear when someone added them.
 */
export function buildHospitalityPlanDay(
  date: string,
  trials: readonly HospitalityTrialInput[]
): HospitalityPlanDay {
  const items = buildLunchOrderList(
    mergeSavedRows(trials.flatMap(trial => trial.saved)),
    trials.flatMap(trial => collectLunchCandidates(trial))
  );

  const roles = LUNCH_ROLES.map(({ id }) => {
    const names = items.filter(item => item.role === id).map(item => item.name);
    return { role: id, label: lunchRoleLabel(id), count: names.length, names };
  }).filter(group => group.count > 0);

  return {
    date,
    trialIds: trials.map(trial => trial.trialId),
    total: items.length,
    roles,
    orders: items.filter(item => item.lunchOrder !== '' || item.dietaryNote !== ''),
  };
}
