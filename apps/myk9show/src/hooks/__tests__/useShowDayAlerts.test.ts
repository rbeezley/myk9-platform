import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useShowDayAlerts } from '../useShowDayAlerts';
import type { ShowDayData, ShowDayClass } from '@/types/show-day-types';
import { useNotificationStore } from '@/store/notificationStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';

// Mock the delivery hook
const mockDeliver = vi.fn();
vi.mock('../useNotificationDelivery', () => ({
  useNotificationDelivery: () => ({ deliver: mockDeliver }),
}));

function makeClass(overrides: Partial<ShowDayClass> = {}): ShowDayClass {
  return {
    classId: 'class-1',
    className: 'Open Agility',
    element: null,
    level: null,
    dogCallName: 'Bella',
    dogId: 'dog-1',
    armband: '42',
    entryId: 'entry-1',
    totalEntries: 20,
    scoredEntries: 15,
    currentDogInRing: null,
    myRunningOrder: 18,
    estimatedTimeMinutes: 9,
    entryStatus: 'checked-in',
    isScored: false,
    resultStatus: null,
    classStatus: 'in_progress',
    showId: 'show-1',
    showName: 'Test Show',
    trialDate: '2026-03-09',
    ringNumber: null,
    ...overrides,
  };
}

function makeShowDayData(overrides: Partial<ShowDayData> = {}): ShowDayData {
  return {
    isShowDay: true,
    activeShows: [],
    activeShow: null,
    myClasses: [],
    nextUp: null,
    completedToday: [],
    stats: { total: 0, completed: 0, qualified: 0 },
    isLoading: false,
    error: null,
    isStale: false,
    lastUpdated: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    isInRing: false,
    recentAlerts: [],
    unreadCount: 0,
    permissionStatus: 'default' as NotificationPermission,
  });
});

describe('useShowDayAlerts', () => {
  it('does nothing when loading', () => {
    const data = makeShowDayData({ isLoading: true });
    renderHook(() => useShowDayAlerts(data));

    expect(mockDeliver).not.toHaveBeenCalled();
  });

  it('does nothing when error', () => {
    const data = makeShowDayData({ error: new Error('fail') });
    renderHook(() => useShowDayAlerts(data));

    expect(mockDeliver).not.toHaveBeenCalled();
  });

  // NOTE: The hook seeds "already seen" sets on initial mount and skips firing.
  // Tests that check for notifications must use a two-render pattern:
  // 1st render with initial state (seeds sets, no notifications fired)
  // 2nd render with changed state (detects transition, fires notification)

  it('fires your_turn when dog moves within leadDogs threshold', () => {
    // Initial: dog is far away (8 dogs ahead, beyond default leadDogs=3)
    const clsInitial = makeClass({ scoredEntries: 10, myRunningOrder: 18 });
    const dataInitial = makeShowDayData({ myClasses: [clsInitial] });

    const { rerender } = renderHook(({ data }) => useShowDayAlerts(data), {
      initialProps: { data: dataInitial },
    });

    expect(mockDeliver).not.toHaveBeenCalled(); // Initial mount: no fire

    // Update: dog is now 3 away (within threshold)
    const clsUpdated = makeClass({ scoredEntries: 15, myRunningOrder: 18 });
    const dataUpdated = makeShowDayData({ myClasses: [clsUpdated] });
    rerender({ data: dataUpdated });

    expect(mockDeliver).toHaveBeenCalledWith(expect.objectContaining({ type: 'your_turn' }));
  });

  it('does not fire your_turn when dog is beyond leadDogs threshold', () => {
    const cls = makeClass({ scoredEntries: 10, myRunningOrder: 18 }); // 8 ahead
    const data = makeShowDayData({ myClasses: [cls] });

    const { rerender } = renderHook(({ data: d }) => useShowDayAlerts(d), {
      initialProps: { data },
    });

    // Still far away on second render
    const cls2 = makeClass({ scoredEntries: 11, myRunningOrder: 18 }); // 7 ahead
    rerender({ data: makeShowDayData({ myClasses: [cls2] }) });

    expect(mockDeliver).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'your_turn' }));
  });

  it('fires class_starting when class transitions to in_progress', () => {
    // Initial: class is not yet started
    const clsInitial = makeClass({ classStatus: 'scheduled' });
    const dataInitial = makeShowDayData({ myClasses: [clsInitial] });

    const { rerender } = renderHook(({ data }) => useShowDayAlerts(data), {
      initialProps: { data: dataInitial },
    });

    expect(mockDeliver).not.toHaveBeenCalled();

    // Transition: class starts
    const clsStarted = makeClass({ classStatus: 'in_progress' });
    rerender({ data: makeShowDayData({ myClasses: [clsStarted] }) });

    expect(mockDeliver).toHaveBeenCalledWith(expect.objectContaining({ type: 'class_starting' }));
  });

  it('does not fire class_starting for classes already in_progress on mount', () => {
    const cls = makeClass({ classStatus: 'in_progress' });
    const data = makeShowDayData({ myClasses: [cls] });

    const { rerender } = renderHook(({ data: d }) => useShowDayAlerts(d), {
      initialProps: { data },
    });
    rerender({ data }); // Same data, second render

    expect(mockDeliver).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'class_starting' })
    );
  });

  it('fires check_in_reminder when check-in opens', () => {
    // Initial: class not open for check-in yet
    const clsInitial = makeClass({ classStatus: 'scheduled', entryStatus: 'no-status' });
    const dataInitial = makeShowDayData({ myClasses: [clsInitial] });

    const { rerender } = renderHook(({ data }) => useShowDayAlerts(data), {
      initialProps: { data: dataInitial },
    });

    // Transition: check-in opens
    const clsOpen = makeClass({ classStatus: 'check_in_open', entryStatus: 'no-status' });
    rerender({ data: makeShowDayData({ myClasses: [clsOpen] }) });

    expect(mockDeliver).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'check_in_reminder' })
    );
  });

  it('does not fire check_in_reminder when already checked in', () => {
    const clsInitial = makeClass({ classStatus: 'scheduled', entryStatus: 'checked-in' });
    const dataInitial = makeShowDayData({ myClasses: [clsInitial] });

    const { rerender } = renderHook(({ data }) => useShowDayAlerts(data), {
      initialProps: { data: dataInitial },
    });

    const clsOpen = makeClass({ classStatus: 'check_in_open', entryStatus: 'checked-in' });
    rerender({ data: makeShowDayData({ myClasses: [clsOpen] }) });

    expect(mockDeliver).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'check_in_reminder' })
    );
  });

  it('fires results_posted when isScored transitions to true', () => {
    // Initial: not scored
    const clsInitial = makeClass({ isScored: false });
    const dataInitial = makeShowDayData({ myClasses: [clsInitial] });

    const { rerender } = renderHook(({ data }) => useShowDayAlerts(data), {
      initialProps: { data: dataInitial },
    });

    // Transition: scored
    const clsScored = makeClass({ isScored: true });
    rerender({ data: makeShowDayData({ myClasses: [clsScored] }) });

    expect(mockDeliver).toHaveBeenCalledWith(expect.objectContaining({ type: 'results_posted' }));
  });

  it('does not fire results_posted for classes already scored on mount', () => {
    const cls = makeClass({ isScored: true });
    const data = makeShowDayData({ myClasses: [cls] });

    const { rerender } = renderHook(({ data: d }) => useShowDayAlerts(d), {
      initialProps: { data },
    });
    rerender({ data }); // Same data, second render

    expect(mockDeliver).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'results_posted' })
    );
  });

  it('does not fire duplicate notifications on re-render', () => {
    // Initial: far away
    const clsInitial = makeClass({ scoredEntries: 10, myRunningOrder: 18 });
    const dataInitial = makeShowDayData({ myClasses: [clsInitial] });

    const { rerender } = renderHook(({ data }) => useShowDayAlerts(data), {
      initialProps: { data: dataInitial },
    });

    // Transition: within threshold
    const clsClose = makeClass({ scoredEntries: 15, myRunningOrder: 18 });
    const dataClose = makeShowDayData({ myClasses: [clsClose] });
    rerender({ data: dataClose });
    rerender({ data: dataClose }); // Third render with same data

    const yourTurnCalls = mockDeliver.mock.calls.filter(
      (call: [{ type: string }]) => call[0].type === 'your_turn'
    );
    expect(yourTurnCalls).toHaveLength(1);
  });
});
