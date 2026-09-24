// Shared snapshot fixtures for the useNotificationMonitor test files.

export interface NotificationSnapshot {
  classes: Array<Record<string, unknown>>;
  entries: Array<Record<string, unknown>>;
}

export function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'owned-entry',
    dog_id: 'dog-1',
    class_id: 'class-1',
    show_id: 'show-1',
    check_in_status: 'checked-in',
    armband: '27',
    is_scored: false,
    result_status: null,
    dog_call_name: 'Ditto',
    ...overrides,
  };
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

export function classRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'class-1',
    name: 'Container Novice A',
    status: 'Pending',
    is_scoring_finalized: false,
    results_released_at: null,
    trial: { show_id: 'show-1', date: daysAgoIso(0).slice(0, 10) },
    ...overrides,
  };
}
