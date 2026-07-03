import { describe, expect, it } from 'vitest';
import {
  CLASS_LIFECYCLE_LABELS,
  deriveClassLifecyclePresentation,
  deriveClassLifecycleValue,
  type ClassLifecycleValue,
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

describe('CLASS_LIFECYCLE_LABELS', () => {
  it.each([
    ['not_started', 'Not started'],
    ['in_progress', 'In Progress'],
    ['completed', 'Completed'],
    ['cancelled', 'Cancelled'],
    ['unknown', 'Unknown status'],
  ] satisfies Array<[ClassLifecycleValue, string]>)('labels %s as %s', (status, label) => {
    expect(CLASS_LIFECYCLE_LABELS[status] ?? CLASS_LIFECYCLE_LABELS.unknown).toBe(label);
  });
});

describe('deriveClassLifecyclePresentation', () => {
  it('returns a single presentation model for published shows', () => {
    expect(
      deriveClassLifecyclePresentation({
        classStatus: 'completed',
        showStatus: 'published',
      })
    ).toEqual({
      value: 'completed',
      label: 'Completed',
      tone: 'complete',
    });
  });

  it.each(['draft', 'unpublished', 'Draft', 'UNPUBLISHED'])(
    'suppresses lifecycle chips for %s shows',
    showStatus => {
      expect(
        deriveClassLifecyclePresentation({
          classStatus: 'in_progress',
          showStatus,
        })
      ).toBeNull();
    }
  );

  it('uses the unknown fallback for unexpected class status values', () => {
    expect(
      deriveClassLifecyclePresentation({
        classStatus: 'future-status',
        showStatus: 'published',
      })
    ).toEqual({
      value: 'unknown',
      label: 'Unknown status',
      tone: 'neutral',
    });
  });
});
