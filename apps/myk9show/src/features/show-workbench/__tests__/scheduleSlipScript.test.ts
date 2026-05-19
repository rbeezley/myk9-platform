import { describe, expect, it } from 'vitest';
import { buildScheduleSlipScript } from '../scheduleSlipScript';

describe('buildScheduleSlipScript', () => {
  it('builds calm PA copy from the schedule delay inputs', () => {
    expect(
      buildScheduleSlipScript({
        showName: 'Bluegrass Classic',
        ring: 'Ring 2',
        delayMinutes: 45,
        affectedClass: 'Container Novice A',
        note: 'We will break for lunch before the next class.',
      })
    ).toBe(
      'Attention exhibitors at Bluegrass Classic: Ring 2 is running about 45 minutes behind. Container Novice A will start later than the posted schedule. Please stay near the ring and listen for your class call. We will share another update if the schedule changes. We will break for lunch before the next class. Thank you for your patience.'
    );
  });

  it('uses calm defaults when optional details are blank', () => {
    expect(
      buildScheduleSlipScript({
        showName: '',
        ring: '',
        delayMinutes: Number.NaN,
        affectedClass: '',
      })
    ).toBe(
      'Attention exhibitors: this ring is running about 30 minutes behind. The affected class will start later than the posted schedule. Please stay near the ring and listen for your class call. We will share another update if the schedule changes. Thank you for your patience.'
    );
  });

  it('uses singular minutes for a one-minute delay', () => {
    expect(
      buildScheduleSlipScript({
        ring: 'Ring 1',
        delayMinutes: 1,
        affectedClass: 'Container Novice A',
      })
    ).toContain('Ring 1 is running about 1 minute behind.');
  });
});
