import { describe, expect, it } from 'vitest';
import { formatJudgeAvailabilityWindow } from '../classJudgeDisplay';

describe('formatJudgeAvailabilityWindow', () => {
  it('renders the window when both ends are present', () => {
    expect(
      formatJudgeAvailabilityWindow({ availableStartTime: '09:00', availableEndTime: '17:00' })
    ).toBe('(09:00 - 17:00)');
  });

  it('renders nothing for a full-day judge', () => {
    expect(
      formatJudgeAvailabilityWindow({ availableStartTime: 'Full Day', availableEndTime: 'Full Day' })
    ).toBeNull();
  });

  it('renders nothing when the times are blank (F13: "Test Judge( - )")', () => {
    expect(formatJudgeAvailabilityWindow({ availableStartTime: '', availableEndTime: '' })).toBeNull();
    expect(formatJudgeAvailabilityWindow({})).toBeNull();
    expect(
      formatJudgeAvailabilityWindow({ availableStartTime: '   ', availableEndTime: '17:00' })
    ).toBeNull();
  });

  it('renders nothing when only one end is known', () => {
    expect(formatJudgeAvailabilityWindow({ availableStartTime: '09:00' })).toBeNull();
    expect(formatJudgeAvailabilityWindow({ availableEndTime: '17:00' })).toBeNull();
  });
});
