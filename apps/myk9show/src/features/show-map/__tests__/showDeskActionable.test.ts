import { describe, expect, it } from 'vitest';
import { computeShowDeskActionable } from '../showDeskActionable';

describe('computeShowDeskActionable', () => {
  it('sums incidents + hospitality + tasks into one count', () => {
    const result = computeShowDeskActionable({
      incidentReportableCount: 2,
      hospitalityReminderCount: 3,
      tasksOpenCount: 4,
    });

    expect(result.count).toBe(9);
  });

  // Regression guard: the bug this change fixes is that ONLY incidents reached
  // the trigger badge. These assertions prove hospitality and tasks each move
  // the count on their own, with no incident present.
  it('reflects hospitality reminders even when there are no incidents', () => {
    const result = computeShowDeskActionable({
      incidentReportableCount: 0,
      hospitalityReminderCount: 5,
      tasksOpenCount: 0,
    });

    expect(result.count).toBe(5);
    expect(result.tone).toBe('routine');
  });

  it('reflects open tasks even when there are no incidents', () => {
    const result = computeShowDeskActionable({
      incidentReportableCount: 0,
      hospitalityReminderCount: 0,
      tasksOpenCount: 3,
    });

    expect(result.count).toBe(3);
    expect(result.tone).toBe('routine');
  });

  it('counts hospitality + tasks together without any incident', () => {
    const result = computeShowDeskActionable({
      incidentReportableCount: 0,
      hospitalityReminderCount: 2,
      tasksOpenCount: 6,
    });

    expect(result.count).toBe(8);
    expect(result.tone).toBe('routine');
  });

  it('is zero and routine when nothing is actionable', () => {
    const result = computeShowDeskActionable({
      incidentReportableCount: 0,
      hospitalityReminderCount: 0,
      tasksOpenCount: 0,
    });

    expect(result.count).toBe(0);
    expect(result.tone).toBe('routine');
  });

  it('escalates to the urgent tone only when a reportable incident exists', () => {
    const result = computeShowDeskActionable({
      incidentReportableCount: 1,
      hospitalityReminderCount: 4,
      tasksOpenCount: 0,
    });

    expect(result.count).toBe(5);
    expect(result.tone).toBe('urgent');
  });
});
