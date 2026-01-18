import { describe, it, expect } from 'vitest';
import {
  CLASS_STATUS,
  CLASS_STATUS_DISPLAY,
  CLASS_STATUS_ORDER,
  getNextClassStatus,
  getClassStatusDisplay,
  getClassStatusBadgeClasses,
  LEGACY_STATUS_MAP,
  normalizeClassStatus,
  type ClassStatusValue,
} from './class-status';

describe('CLASS_STATUS constants', () => {
  it('should have all expected status values', () => {
    expect(CLASS_STATUS.SCHEDULED).toBe('Scheduled');
    expect(CLASS_STATUS.UPCOMING).toBe('Upcoming');
    expect(CLASS_STATUS.IN_PROGRESS).toBe('In Progress');
    expect(CLASS_STATUS.COMPLETED).toBe('Completed');
    expect(CLASS_STATUS.CANCELLED).toBe('Cancelled');
  });

  it('should have 5 status values', () => {
    expect(Object.keys(CLASS_STATUS)).toHaveLength(5);
  });
});

describe('CLASS_STATUS_DISPLAY', () => {
  it('should have display config for Scheduled', () => {
    const display = CLASS_STATUS_DISPLAY[CLASS_STATUS.SCHEDULED];
    expect(display.label).toBe('Upcoming');
    expect(display.color).toBe('blue');
    expect(display.bgClass).toBe('bg-blue-100');
    expect(display.textClass).toBe('text-blue-800');
  });

  it('should have display config for Upcoming (alias)', () => {
    const display = CLASS_STATUS_DISPLAY[CLASS_STATUS.UPCOMING];
    expect(display.label).toBe('Upcoming');
    expect(display.color).toBe('blue');
  });

  it('should have display config for In Progress', () => {
    const display = CLASS_STATUS_DISPLAY[CLASS_STATUS.IN_PROGRESS];
    expect(display.label).toBe('In Progress');
    expect(display.color).toBe('amber');
  });

  it('should have display config for Completed', () => {
    const display = CLASS_STATUS_DISPLAY[CLASS_STATUS.COMPLETED];
    expect(display.label).toBe('Complete');
    expect(display.color).toBe('green');
  });

  it('should have display config for Cancelled', () => {
    const display = CLASS_STATUS_DISPLAY[CLASS_STATUS.CANCELLED];
    expect(display.label).toBe('Cancelled');
    expect(display.color).toBe('gray');
  });
});

describe('CLASS_STATUS_ORDER', () => {
  it('should have 3 statuses in progression order', () => {
    expect(CLASS_STATUS_ORDER).toHaveLength(3);
    expect(CLASS_STATUS_ORDER[0]).toBe(CLASS_STATUS.SCHEDULED);
    expect(CLASS_STATUS_ORDER[1]).toBe(CLASS_STATUS.IN_PROGRESS);
    expect(CLASS_STATUS_ORDER[2]).toBe(CLASS_STATUS.COMPLETED);
  });

  it('should not include Cancelled in progression', () => {
    expect(CLASS_STATUS_ORDER).not.toContain(CLASS_STATUS.CANCELLED);
  });
});

describe('getNextClassStatus', () => {
  it('should cycle from Scheduled to In Progress', () => {
    expect(getNextClassStatus(CLASS_STATUS.SCHEDULED)).toBe(CLASS_STATUS.IN_PROGRESS);
  });

  it('should cycle from In Progress to Completed', () => {
    expect(getNextClassStatus(CLASS_STATUS.IN_PROGRESS)).toBe(CLASS_STATUS.COMPLETED);
  });

  it('should cycle from Completed back to Scheduled', () => {
    expect(getNextClassStatus(CLASS_STATUS.COMPLETED)).toBe(CLASS_STATUS.SCHEDULED);
  });

  it('should return Scheduled for unknown status', () => {
    expect(getNextClassStatus('Unknown' as ClassStatusValue)).toBe(CLASS_STATUS.SCHEDULED);
  });

  it('should return Scheduled for Cancelled status', () => {
    expect(getNextClassStatus(CLASS_STATUS.CANCELLED)).toBe(CLASS_STATUS.SCHEDULED);
  });
});

describe('getClassStatusDisplay', () => {
  it('should return display config for known status', () => {
    const display = getClassStatusDisplay(CLASS_STATUS.SCHEDULED);
    expect(display.label).toBe('Upcoming');
    expect(display.color).toBe('blue');
  });

  it('should return default config for unknown status', () => {
    const display = getClassStatusDisplay('Unknown');
    expect(display.label).toBe('Unknown');
    expect(display.color).toBe('gray');
    expect(display.bgClass).toBe('bg-gray-100');
  });
});

describe('getClassStatusBadgeClasses', () => {
  it('should return combined classes for Scheduled', () => {
    const classes = getClassStatusBadgeClasses(CLASS_STATUS.SCHEDULED);
    expect(classes).toContain('bg-blue-100');
    expect(classes).toContain('text-blue-800');
    expect(classes).toContain('dark:bg-blue-900/30');
    expect(classes).toContain('dark:text-blue-300');
  });

  it('should return combined classes for In Progress', () => {
    const classes = getClassStatusBadgeClasses(CLASS_STATUS.IN_PROGRESS);
    expect(classes).toContain('bg-amber-100');
    expect(classes).toContain('text-amber-800');
  });

  it('should return gray classes for unknown status', () => {
    const classes = getClassStatusBadgeClasses('Unknown');
    expect(classes).toContain('bg-gray-100');
    expect(classes).toContain('text-gray-800');
  });
});

describe('LEGACY_STATUS_MAP', () => {
  it('should map Scheduled variations', () => {
    expect(LEGACY_STATUS_MAP['Scheduled']).toBe(CLASS_STATUS.SCHEDULED);
    expect(LEGACY_STATUS_MAP['scheduled']).toBe(CLASS_STATUS.SCHEDULED);
  });

  it('should map Upcoming to UPCOMING', () => {
    expect(LEGACY_STATUS_MAP['Upcoming']).toBe(CLASS_STATUS.UPCOMING);
    expect(LEGACY_STATUS_MAP['upcoming']).toBe(CLASS_STATUS.UPCOMING);
  });

  it('should map Pending to Scheduled', () => {
    expect(LEGACY_STATUS_MAP['Pending']).toBe(CLASS_STATUS.SCHEDULED);
    expect(LEGACY_STATUS_MAP['pending']).toBe(CLASS_STATUS.SCHEDULED);
  });

  it('should map In Progress variations', () => {
    expect(LEGACY_STATUS_MAP['In Progress']).toBe(CLASS_STATUS.IN_PROGRESS);
    expect(LEGACY_STATUS_MAP['InProgress']).toBe(CLASS_STATUS.IN_PROGRESS);
  });

  it('should map Completed variations', () => {
    expect(LEGACY_STATUS_MAP['Completed']).toBe(CLASS_STATUS.COMPLETED);
    expect(LEGACY_STATUS_MAP['Complete']).toBe(CLASS_STATUS.COMPLETED);
  });

  it('should map Cancelled variations', () => {
    expect(LEGACY_STATUS_MAP['Cancelled']).toBe(CLASS_STATUS.CANCELLED);
    expect(LEGACY_STATUS_MAP['Canceled']).toBe(CLASS_STATUS.CANCELLED);
  });
});

describe('normalizeClassStatus', () => {
  it('should normalize Pending to Scheduled', () => {
    expect(normalizeClassStatus('Pending')).toBe(CLASS_STATUS.SCHEDULED);
  });

  it('should normalize Upcoming to Upcoming', () => {
    expect(normalizeClassStatus('Upcoming')).toBe(CLASS_STATUS.UPCOMING);
  });

  it('should normalize Complete to Completed', () => {
    expect(normalizeClassStatus('Complete')).toBe(CLASS_STATUS.COMPLETED);
  });

  it('should return Scheduled for unknown status', () => {
    expect(normalizeClassStatus('Unknown')).toBe(CLASS_STATUS.SCHEDULED);
  });

  it('should normalize case-insensitive In Progress', () => {
    expect(normalizeClassStatus('in progress')).toBe(CLASS_STATUS.IN_PROGRESS);
  });
});
