/**
 * Unit Tests for Status Formatting Utilities
 */

import {
  getContextualPreview,
  getFormattedStatus,
  getStatusColor,
  getStatusLabel
} from './statusFormatting';

const createMockClass = (overrides: any = {}) => ({
  id: 1,
  class_name: 'Container Novice A',
  element: 'Container',
  level: 'Novice',
  section: 'A',
  entry_count: 5,
  completed_count: 0,
  dogs: [],
  is_favorite: false,
  class_status: 'no-status' as const,
  ...overrides
});

describe('getContextualPreview', () => {
  test('should show not started status', () => {
    const classEntry = createMockClass({
      entry_count: 5,
      completed_count: 0,
      class_status: 'no-status',
      dogs: []
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
      dogs: Array(5).fill({ is_scored: true, in_ring: false })
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
        { armband: '103', call_name: 'Rex', is_scored: false, in_ring: true }
      ]
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
        { armband: '103', is_scored: false, in_ring: false }
      ]
    });

    const preview = getContextualPreview(classEntry);
    expect(preview).toContain('3 of 5 remaining');
  });
});

describe('getFormattedStatus', () => {
  test('should format setup status', () => {
    const classEntry = createMockClass({
      class_status: 'setup',
      completed_count: 0
    });

    const status = getFormattedStatus(classEntry);
    expect(status.label).toBe('Setup');
  });

  test('should format briefing status with time', () => {
    const classEntry = createMockClass({
      class_status: 'briefing',
      briefing_time: '9:30 AM'
    });

    const status = getFormattedStatus(classEntry);
    expect(status.label).toBe('Briefing');
    expect(status.time).toBe('9:30 AM');
  });

  test('should format in-progress status', () => {
    const classEntry = createMockClass({
      class_status: 'in_progress',
      entry_count: 5,
      completed_count: 2
    });

    const status = getFormattedStatus(classEntry);
    expect(status.label).toBe('In Progress');
    expect(status.time).toBe(null); // getFormattedStatus returns null for in_progress, not "2 of 5"
  });

  test('should format completed status', () => {
    const classEntry = createMockClass({
      class_status: 'completed',
      is_scoring_finalized: true,
      entry_count: 5,
      completed_count: 5
    });

    const status = getFormattedStatus(classEntry);
    expect(status.label).toBe('Completed');
  });
});

describe('getStatusColor', () => {
  test('should return correct color for setup', () => {
    const classEntry = createMockClass({ class_status: 'setup' });
    expect(getStatusColor(classEntry.class_status, classEntry)).toBe('setup');
  });

  test('should return correct color for in-progress', () => {
    const classEntry = createMockClass({
      class_status: 'in_progress',
      entry_count: 5,
      completed_count: 2
    });
    expect(getStatusColor(classEntry.class_status, classEntry)).toBe('in-progress');
  });

  test('should return correct color for completed', () => {
    const classEntry = createMockClass({
      class_status: 'completed',
      is_scoring_finalized: true
    });
    expect(getStatusColor(classEntry.class_status, classEntry)).toBe('completed');
  });
});

describe('getStatusLabel', () => {
  test('should return label for setup', () => {
    const classEntry = createMockClass({ class_status: 'setup' });
    const label = getStatusLabel(classEntry.class_status, classEntry);
    expect(label).toBe('Setup');
  });

  test('should return label for in-progress', () => {
    const classEntry = createMockClass({
      class_status: 'in_progress',
      entry_count: 5,
      completed_count: 2
    });
    const label = getStatusLabel(classEntry.class_status, classEntry);
    expect(label).toBe('In Progress'); // getStatusLabel doesn't include "2 of 5"
  });

  test('should return label for completed', () => {
    const classEntry = createMockClass({
      class_status: 'completed',
      is_scoring_finalized: true
    });
    const label = getStatusLabel(classEntry.class_status, classEntry);
    expect(label).toBe('Completed');
  });
});
