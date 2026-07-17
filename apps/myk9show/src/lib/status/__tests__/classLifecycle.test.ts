import { describe, expect, it } from 'vitest';
import {
  deriveClassLifecycleValue,
  shouldShowClassLifecycle,
} from '../classLifecycle';

describe('deriveClassLifecycleValue', () => {
  it.each([
    ['Scheduled', 'not_started'],
    ['Upcoming', 'not_started'],
    ['setup', 'not_started'],
    ['no-status', 'not_started'],
    ['none', 'not_started'],
    ['in_progress', 'in_progress'],
    ['In Progress', 'in_progress'],
    ['offline-scoring', 'in_progress'],
    ['completed', 'completed'],
    ['Complete', 'completed'],
    ['cancelled', 'cancelled'],
    ['mystery-status', 'unknown'],
    [null, 'unknown'],
  ] as const)('maps %s to %s', (rawStatus, expected) => {
    expect(deriveClassLifecycleValue(rawStatus)).toBe(expected);
  });
});

describe('shouldShowClassLifecycle', () => {
  it.each(['draft', 'unpublished', 'Draft', 'UNPUBLISHED'])(
    'suppresses lifecycle chips for %s shows',
    showStatus => {
      expect(shouldShowClassLifecycle(showStatus)).toBe(false);
    }
  );

  it('shows lifecycle for published and unknown show states', () => {
    expect(shouldShowClassLifecycle('published')).toBe(true);
    expect(shouldShowClassLifecycle('future-status')).toBe(true);
  });
});
