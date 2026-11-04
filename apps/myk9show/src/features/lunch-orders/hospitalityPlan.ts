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

/** One show day of the Hospitality plan: headcount by role, then who ordered what. */
export interface HospitalityPlanDay {
  trialId: string;
  total: number;
  roles: HospitalityRoleGroup[];
  /** Only people with a lunch order or a dietary note typed; everyone else is in `roles`. */
  orders: LunchListItem[];
}

interface HospitalityDayInput {
  trialId: string;
  saved: readonly LunchOrderRow[];
  judges: readonly JudgeOnDay[];
  officials: ShowOfficials | undefined;
  volunteers: readonly VolunteerOnDay[];
}

/**
 * The plan for one day. It reuses the Lunch orders list's own merge (the same candidates, the
 * same one-person-once priority), so the report can never disagree with the list: headcount is
 * everyone assigned that day plus anyone added to the list. Exhibitors only ever appear when
 * someone added them.
 */
export function buildHospitalityPlanDay({
  trialId,
  saved,
  judges,
  officials,
  volunteers,
}: HospitalityDayInput): HospitalityPlanDay {
  const items = buildLunchOrderList(
    saved,
    collectLunchCandidates({
      trialId,
      judges,
      officials,
      volunteers,
    })
  );

  const roles = LUNCH_ROLES.map(({ id }) => {
    const names = items.filter(item => item.role === id).map(item => item.name);
    return { role: id, label: lunchRoleLabel(id), count: names.length, names };
  }).filter(group => group.count > 0);

  return {
    trialId,
    total: items.length,
    roles,
    orders: items.filter(item => item.lunchOrder !== '' || item.dietaryNote !== ''),
  };
}
