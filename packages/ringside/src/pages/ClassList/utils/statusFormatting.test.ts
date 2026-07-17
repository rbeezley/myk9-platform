/**
 * Unit Tests for Status Formatting Utilities
 */

import {
  getContextualPreview,
} from './statusFormatting';

const createMockClass = (overrides: Record<string, unknown> = {}) => ({
  id: '1',
  class_name: 'Container Novice A',
  element: 'Container',
  level: 'Novice',
  section: 'A',
  entry_count: 5,
  completed_count: 0,
  dogs: [],
  is_favorite: false,
  class_status: 'no-status' as const,
  ...overrides,
});

describe('getContextualPreview', () => {
  test('should show not started status', () => {
    const classEntry = createMockClass({
      entry_count: 5,
      completed_count: 0,
      class_status: 'no-status',
      dogs: [],
    });

    const preview = getContextualPreview(classEntry);
    expect(preview).toContain('5 entries');
    expect(preview).toContain('Not yet started');
  });

  test('should show completed status', () => {
    const classEntry = createMockClass({
      entry_count: 5,
      completed_count: 5,
      class_status: 'completed',
      is_scoring_finalized: true,
      dogs: Array(5).fill({ is_scored: true, in_ring: false }),
    });

    const preview = getContextualPreview(classEntry);
    expect(preview).toContain('Completed');
    expect(preview).toContain('5 entries scored');
  });

  test('should show in-progress status with in-ring dog', () => {
    const classEntry = createMockClass({
      entry_count: 5,
      completed_count: 2,
      class_status: 'in_progress',
      dogs: [
        { armband: '101', call_name: 'Buddy', is_scored: true, in_ring: false },
        { armband: '102', call_name: 'Max', is_scored: true, in_ring: false },
        { armband: '103', call_name: 'Rex', is_scored: false, in_ring: true },
      ],
    });

    const preview = getContextualPreview(classEntry);
    expect(preview).toContain('In Ring: 103');
    expect(preview).toContain('Rex');
    expect(preview).toContain('3 of 5 remaining');
  });

  test('should handle in-progress with no in-ring dog', () => {
    const classEntry = createMockClass({
      entry_count: 5,
      completed_count: 2,
      class_status: 'in_progress',
      dogs: [
        { is_scored: true, in_ring: false },
        { is_scored: true, in_ring: false },
        { armband: '103', is_scored: false, in_ring: false },
      ],
    });

    const preview = getContextualPreview(classEntry);
    expect(preview).toContain('3 of 5 remaining');
  });
});
