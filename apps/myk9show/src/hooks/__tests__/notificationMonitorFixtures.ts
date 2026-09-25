// Shared snapshot fixtures for the useNotificationMonitor test files.

export interface NotificationSnapshot {
  classes: Array<Record<string, unknown>>;
  entries: Array<Record<string, unknown>>;
  /** When the request that produced it started (MYK9-742). */
  startedAt?: number;
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

export function classRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'class-1',
    name: 'Container Novice A',
    status: 'Pending',
    is_scoring_finalized: false,
    results_released_at: null,
    ...overrides,
  };
}
