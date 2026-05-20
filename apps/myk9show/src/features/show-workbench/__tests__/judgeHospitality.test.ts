import { describe, expect, it } from 'vitest';
import { summarizeJudgeHospitality } from '../judgeHospitality';

describe('summarizeJudgeHospitality', () => {
  it('counts lunch, water, and handled judge reminders', () => {
    expect(
      summarizeJudgeHospitality(
        [
          { id: 'judge-1', name: 'Pat Judge' },
          { id: 'judge-2', name: 'Sam Judge' },
        ],
        {
          'judge-1': {
            coffeeDelivered: true,
            lunchDelivered: false,
            lunchOrder: 'Turkey sandwich',
            notes: '',
            waterDelivered: true,
            waterDeclined: false,
          },
          'judge-2': {
            coffeeDelivered: false,
            lunchDelivered: false,
            lunchOrder: '',
            notes: '',
            waterDelivered: false,
            waterDeclined: false,
          },
        }
      )
    ).toEqual({
      judgeCount: 2,
      lunchOrderCount: 1,
      lunchPendingCount: 1,
      waterPendingCount: 1,
      handledCount: 0,
    });
  });

  it('treats declined water as handled while coffee stays optional detail', () => {
    expect(
      summarizeJudgeHospitality(
        [
          { id: 'judge-1', name: 'Pat Judge' },
          { id: 'judge-2', name: 'Sam Judge' },
        ],
        {
          'judge-1': {
            coffeeDelivered: true,
            lunchDelivered: false,
            lunchOrder: '',
            notes: '',
            waterDelivered: false,
            waterDeclined: false,
          },
          'judge-2': {
            coffeeDelivered: false,
            lunchDelivered: false,
            lunchOrder: '',
            notes: '',
            waterDelivered: false,
            waterDeclined: true,
          },
        }
      )
    ).toMatchObject({
      waterPendingCount: 1,
      handledCount: 1,
    });
  });
});
