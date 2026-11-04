import { describe, expect, it } from 'vitest';
import { computeShowDeskActionable } from '../showDeskActionable';

describe('computeShowDeskActionable', () => {
  it('sums incidents + tasks into one count', () => {
    const result = computeShowDeskActionable({
      incidentReportableCount: 2,
      tasksOpenCount: 4,
    });

    expect(result.count).toBe(6);
  });

  // MYK9-1694: lunch planning is not an action item. The signals type has no hospitality
  // term, and a stray one passed through a cast must not move the badge.
  it('ignores any hospitality figure: lunch planning never counts toward the badge', () => {
    const signals = {
      incidentReportableCount: 0,
      tasksOpenCount: 0,
      hospitalityReminderCount: 7,
    };

    expect(computeShowDeskActionable(signals).count).toBe(0);
  });

  it('reflects open tasks even when there are no incidents', () => {
    const result = computeShowDeskActionable({
      incidentReportableCount: 0,
      tasksOpenCount: 3,
    });

    expect(result.count).toBe(3);
    expect(result.tone).toBe('routine');
  });

  it('is zero and routine when nothing is actionable', () => {
    const result = computeShowDeskActionable({
      incidentReportableCount: 0,
      tasksOpenCount: 0,
    });

    expect(result.count).toBe(0);
    expect(result.tone).toBe('routine');
  });

  it('escalates to the urgent tone only when a reportable incident exists', () => {
    const result = computeShowDeskActionable({
      incidentReportableCount: 1,
      tasksOpenCount: 0,
    });

    expect(result.count).toBe(1);
    expect(result.tone).toBe('urgent');
  });
});

/**
 * Audit H2. The incidents and tasks reads both pause offline, returning
 * `data: undefined` with `isLoading` false. Summing those as zero produced a
 * calm, idle badge during exactly the outage this aggregate exists to surface.
 * A count that omits an unread source is a FLOOR, and the caller has to be able
 * to tell.
 */
describe('computeShowDeskActionable — unread sources (audit H2)', () => {
  it('marks the result incomplete when incidents could not be read', () => {
    const result = computeShowDeskActionable({
      incidentReportableCount: null,
      tasksOpenCount: 0,
    });

    expect(result.incomplete).toBe(true);
    expect(result.count).toBe(0);
  });

  it('marks the result incomplete when tasks could not be read', () => {
    const result = computeShowDeskActionable({
      incidentReportableCount: 0,
      tasksOpenCount: null,
    });

    expect(result.incomplete).toBe(true);
  });

  it('is complete when every source was read, even at zero', () => {
    const result = computeShowDeskActionable({
      incidentReportableCount: 0,
      tasksOpenCount: 0,
    });

    expect(result.incomplete).toBe(false);
  });

  it('still counts what it did read, so partial knowledge is not discarded', () => {
    const result = computeShowDeskActionable({
      incidentReportableCount: null,
      tasksOpenCount: 3,
    });

    expect(result.count).toBe(3);
    expect(result.incomplete).toBe(true);
  });

  it('does not claim urgency it cannot substantiate', () => {
    const result = computeShowDeskActionable({
      incidentReportableCount: null,
      tasksOpenCount: 0,
    });

    // Unknown incidents must not escalate the tone -- that would be the same
    // error as the original bug, inverted into a false alarm.
    expect(result.tone).toBe('routine');
  });
});
