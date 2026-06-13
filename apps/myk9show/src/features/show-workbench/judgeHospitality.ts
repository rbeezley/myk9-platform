export interface JudgeHospitalityJudge {
  id: string;
  name: string;
}

export interface JudgeHospitalityItem {
  coffeeDelivered: boolean;
  lunchDelivered: boolean;
  lunchOrder: string;
  notes: string;
  waterDelivered: boolean;
  waterDeclined: boolean;
}

export type JudgeHospitalityState = Record<string, JudgeHospitalityItem>;

export interface JudgeHospitalitySummary {
  judgeCount: number;
  lunchOrderCount: number;
  lunchPendingCount: number;
  waterPendingCount: number;
  handledCount: number;
}

export const EMPTY_HOSPITALITY_ITEM: JudgeHospitalityItem = {
  coffeeDelivered: false,
  lunchDelivered: false,
  lunchOrder: '',
  notes: '',
  waterDelivered: false,
  waterDeclined: false,
};

export function judgeHospitalityStorageKey(showId: string): string {
  return `myk9show:judge-hospitality:${showId}`;
}

// Hospitality state lives in localStorage, which is not reactive. The Show Desk
// Tools trigger badge (rendered outside this card) needs to recompute its
// "N reminders" glance when the secretary toggles a checkbox inside the open
// sheet. writeJudgeHospitalityState fires this event on every persist so
// useJudgeHospitalityReminderCount can re-read without polling.
export const JUDGE_HOSPITALITY_CHANGE_EVENT = 'myk9show:judge-hospitality-change';

function normalizeItem(value: unknown): JudgeHospitalityItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...EMPTY_HOSPITALITY_ITEM };
  }

  const item = value as Record<string, unknown>;
  return {
    coffeeDelivered: item.coffeeDelivered === true,
    lunchDelivered: item.lunchDelivered === true,
    lunchOrder: typeof item.lunchOrder === 'string' ? item.lunchOrder : '',
    notes: typeof item.notes === 'string' ? item.notes : '',
    waterDelivered: item.waterDelivered === true,
    waterDeclined: item.waterDeclined === true,
  };
}

export function readJudgeHospitalityState(
  showId: string,
  judges: readonly JudgeHospitalityJudge[]
): JudgeHospitalityState {
  if (typeof window === 'undefined') return {};
  const raw = window.localStorage.getItem(judgeHospitalityStorageKey(showId));
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      judges
        .filter(judge => parsed[judge.id])
        .map(judge => [judge.id, normalizeItem(parsed[judge.id])])
    );
  } catch {
    return {};
  }
}

export function writeJudgeHospitalityState(showId: string, state: JudgeHospitalityState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(judgeHospitalityStorageKey(showId), JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(JUDGE_HOSPITALITY_CHANGE_EVENT, { detail: { showId } }));
}

export function summarizeJudgeHospitality(
  judges: readonly JudgeHospitalityJudge[],
  state: JudgeHospitalityState
): JudgeHospitalitySummary {
  let lunchOrderCount = 0;
  let lunchPendingCount = 0;
  let waterPendingCount = 0;
  let handledCount = 0;

  for (const judge of judges) {
    const item = state[judge.id] ?? EMPTY_HOSPITALITY_ITEM;
    const hasLunchOrder = item.lunchOrder.trim().length > 0;
    const waterHandled = item.waterDelivered || item.waterDeclined;
    if (hasLunchOrder) lunchOrderCount += 1;
    if (hasLunchOrder && !item.lunchDelivered) lunchPendingCount += 1;
    if (!waterHandled) waterPendingCount += 1;
    // Coffee is optional; water can be delivered or explicitly declined.
    if (waterHandled && (!hasLunchOrder || item.lunchDelivered)) handledCount += 1;
  }

  return {
    judgeCount: judges.length,
    lunchOrderCount,
    lunchPendingCount,
    waterPendingCount,
    handledCount,
  };
}
