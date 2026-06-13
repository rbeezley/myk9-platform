import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  writeJudgeHospitalityState,
  type JudgeHospitalityJudge,
} from '../judgeHospitality';
import { useJudgeHospitalityReminderCount } from '../useJudgeHospitalityReminderCount';

const JUDGES: JudgeHospitalityJudge[] = [
  { id: 'j1', name: 'Judge One' },
  { id: 'j2', name: 'Judge Two' },
];

describe('useJudgeHospitalityReminderCount', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('counts a pending water reminder for each untracked judge', () => {
    // No persisted state → every judge still needs water → one reminder each.
    const { result } = renderHook(() => useJudgeHospitalityReminderCount('show-1', JUDGES));
    expect(result.current).toBe(2);
  });

  it('recomputes when hospitality state is persisted (the change event fires)', () => {
    const { result } = renderHook(() => useJudgeHospitalityReminderCount('show-1', JUDGES));
    expect(result.current).toBe(2);

    act(() => {
      // Handle both judges' water — the persist fires JUDGE_HOSPITALITY_CHANGE_EVENT,
      // which the hook subscribes to.
      writeJudgeHospitalityState('show-1', {
        j1: {
          coffeeDelivered: false,
          lunchDelivered: false,
          lunchOrder: '',
          notes: '',
          waterDelivered: true,
          waterDeclined: false,
        },
        j2: {
          coffeeDelivered: false,
          lunchDelivered: false,
          lunchOrder: '',
          notes: '',
          waterDelivered: false,
          waterDeclined: true,
        },
      });
    });

    expect(result.current).toBe(0);
  });

  it('counts a pending lunch reminder when an order is taken but not delivered', () => {
    writeJudgeHospitalityState('show-1', {
      j1: {
        coffeeDelivered: false,
        lunchDelivered: false,
        lunchOrder: 'Turkey on rye',
        notes: '',
        waterDelivered: true,
        waterDeclined: false,
      },
      j2: {
        coffeeDelivered: false,
        lunchDelivered: false,
        lunchOrder: '',
        notes: '',
        waterDelivered: true,
        waterDeclined: false,
      },
    });

    const { result } = renderHook(() => useJudgeHospitalityReminderCount('show-1', JUDGES));
    // j1: lunch pending (order, not delivered); j2: fully handled.
    expect(result.current).toBe(1);
  });

  it('resyncs during render when the show changes', () => {
    writeJudgeHospitalityState('show-1', {
      j1: {
        coffeeDelivered: false,
        lunchDelivered: false,
        lunchOrder: '',
        notes: '',
        waterDelivered: true,
        waterDeclined: false,
      },
      j2: {
        coffeeDelivered: false,
        lunchDelivered: false,
        lunchOrder: '',
        notes: '',
        waterDelivered: true,
        waterDeclined: false,
      },
    });

    const { result, rerender } = renderHook(
      ({ showId }) => useJudgeHospitalityReminderCount(showId, JUDGES),
      { initialProps: { showId: 'show-1' } }
    );
    expect(result.current).toBe(0);

    // show-2 has no persisted state → both judges' water is pending again.
    rerender({ showId: 'show-2' });
    expect(result.current).toBe(2);
  });
});
