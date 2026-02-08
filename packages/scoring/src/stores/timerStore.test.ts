/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTimerStore } from './timerStore';

describe('timerStore', () => {
  let store: ReturnType<typeof createTimerStore>;

  beforeEach(() => {
    store = createTimerStore();
    vi.stubGlobal('crypto', {
      randomUUID: () => `uuid-${Math.random().toString(36).slice(2)}`,
    });
  });

  describe('createTimerStore', () => {
    it('should create a store with correct initial state', () => {
      const state = store.getState();
      expect(state.areas).toEqual([]);
      expect(state.activeAreaId).toBeNull();
      expect(state.globalStartTime).toBeNull();
      expect(state.globalElapsedTime).toBe(0);
      expect(state.isAnyTimerRunning).toBe(false);
      expect(state.soundEnabled).toBe(true);
      expect(state.volumeLevel).toBe(0.7);
    });

    it('should create independent store instances', () => {
      const store2 = createTimerStore();
      store.getState().createArea('Area 1');
      expect(store.getState().areas).toHaveLength(1);
      expect(store2.getState().areas).toHaveLength(0);
    });
  });

  describe('createArea', () => {
    it('should create an area with correct properties', () => {
      const area = store.getState().createArea('Container Search');

      expect(area.name).toBe('Container Search');
      expect(area.id).toBeDefined();
      expect(area.startTime).toBeNull();
      expect(area.endTime).toBeNull();
      expect(area.elapsedTime).toBe(0);
      expect(area.isRunning).toBe(false);
      expect(area.isPaused).toBe(false);
      expect(area.maxTime).toBeUndefined();
    });

    it('should create an area with maxTime', () => {
      const area = store.getState().createArea('Interior', 180000);
      expect(area.maxTime).toBe(180000);
    });

    it('should add area to the store', () => {
      store.getState().createArea('Area 1');
      store.getState().createArea('Area 2');
      expect(store.getState().areas).toHaveLength(2);
    });
  });

  describe('removeArea', () => {
    it('should remove an area by id', () => {
      const area = store.getState().createArea('Area 1');
      store.getState().createArea('Area 2');

      store.getState().removeArea(area.id);
      expect(store.getState().areas).toHaveLength(1);
      expect(store.getState().areas[0]!.name).toBe('Area 2');
    });

    it('should clear activeAreaId if removed area was active', () => {
      const area = store.getState().createArea('Area 1');
      store.getState().startTimer(area.id);
      expect(store.getState().activeAreaId).toBe(area.id);

      store.getState().removeArea(area.id);
      expect(store.getState().activeAreaId).toBeNull();
    });
  });

  describe('clearAllAreas', () => {
    it('should remove all areas and reset state', () => {
      store.getState().createArea('Area 1');
      store.getState().createArea('Area 2');
      store.getState().clearAllAreas();

      const state = store.getState();
      expect(state.areas).toEqual([]);
      expect(state.activeAreaId).toBeNull();
      expect(state.globalStartTime).toBeNull();
      expect(state.globalElapsedTime).toBe(0);
      expect(state.isAnyTimerRunning).toBe(false);
    });
  });

  describe('startTimer', () => {
    it('should start a timer for an area', () => {
      const area = store.getState().createArea('Area 1');
      store.getState().startTimer(area.id);

      const updatedArea = store.getState().areas[0]!;
      expect(updatedArea.isRunning).toBe(true);
      expect(updatedArea.isPaused).toBe(false);
      expect(updatedArea.startTime).not.toBeNull();
      expect(updatedArea.endTime).toBeNull();
    });

    it('should set activeAreaId', () => {
      const area = store.getState().createArea('Area 1');
      store.getState().startTimer(area.id);
      expect(store.getState().activeAreaId).toBe(area.id);
    });

    it('should set isAnyTimerRunning to true', () => {
      const area = store.getState().createArea('Area 1');
      store.getState().startTimer(area.id);
      expect(store.getState().isAnyTimerRunning).toBe(true);
    });

    it('should set globalStartTime on first start', () => {
      const area = store.getState().createArea('Area 1');
      store.getState().startTimer(area.id);
      expect(store.getState().globalStartTime).not.toBeNull();
    });

    it('should not restart an already running timer', () => {
      const area = store.getState().createArea('Area 1');
      store.getState().startTimer(area.id);
      const firstStartTime = store.getState().areas[0]!.startTime;

      // Calling startTimer again on a running timer should be a no-op
      store.getState().startTimer(area.id);
      expect(store.getState().areas[0]!.startTime).toBe(firstStartTime);
    });
  });

  describe('stopTimer', () => {
    it('should stop a running timer', () => {
      const area = store.getState().createArea('Area 1');
      store.getState().startTimer(area.id);
      store.getState().stopTimer(area.id);

      const updatedArea = store.getState().areas[0]!;
      expect(updatedArea.isRunning).toBe(false);
      expect(updatedArea.isPaused).toBe(false);
      expect(updatedArea.endTime).not.toBeNull();
    });

    it('should calculate elapsed time', () => {
      let mockTime = 1000000;
      vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

      const area = store.getState().createArea('Area 1');
      store.getState().startTimer(area.id);

      // Advance mock time by 5 seconds
      mockTime += 5000;
      store.getState().stopTimer(area.id);

      expect(store.getState().areas[0]!.elapsedTime).toBe(5000);
      vi.restoreAllMocks();
    });

    it('should set isAnyTimerRunning to false when last timer stops', () => {
      const area = store.getState().createArea('Area 1');
      store.getState().startTimer(area.id);
      store.getState().stopTimer(area.id);
      expect(store.getState().isAnyTimerRunning).toBe(false);
    });
  });

  describe('pauseTimer', () => {
    it('should pause a running timer', () => {
      const area = store.getState().createArea('Area 1');
      store.getState().startTimer(area.id);
      store.getState().pauseTimer(area.id);

      const updatedArea = store.getState().areas[0]!;
      expect(updatedArea.isRunning).toBe(false);
      expect(updatedArea.isPaused).toBe(true);
    });

    it('should accumulate elapsed time when paused', () => {
      let mockTime = 1000000;
      vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

      const area = store.getState().createArea('Area 1');
      store.getState().startTimer(area.id);

      // Advance mock time by 3 seconds
      mockTime += 3000;
      store.getState().pauseTimer(area.id);

      expect(store.getState().areas[0]!.elapsedTime).toBe(3000);
      vi.restoreAllMocks();
    });
  });

  describe('resumeTimer', () => {
    it('should resume a paused timer', () => {
      const area = store.getState().createArea('Area 1');
      store.getState().startTimer(area.id);
      store.getState().pauseTimer(area.id);
      store.getState().resumeTimer(area.id);

      const updatedArea = store.getState().areas[0]!;
      expect(updatedArea.isRunning).toBe(true);
      expect(updatedArea.isPaused).toBe(false);
    });

    it('should set isAnyTimerRunning to true', () => {
      const area = store.getState().createArea('Area 1');
      store.getState().startTimer(area.id);
      store.getState().pauseTimer(area.id);
      store.getState().resumeTimer(area.id);
      expect(store.getState().isAnyTimerRunning).toBe(true);
    });
  });

  describe('resetTimer', () => {
    it('should reset timer to initial state', () => {
      const area = store.getState().createArea('Area 1');
      store.getState().startTimer(area.id);
      store.getState().resetTimer(area.id);

      const updatedArea = store.getState().areas[0]!;
      expect(updatedArea.startTime).toBeNull();
      expect(updatedArea.endTime).toBeNull();
      expect(updatedArea.elapsedTime).toBe(0);
      expect(updatedArea.isRunning).toBe(false);
      expect(updatedArea.isPaused).toBe(false);
    });

    it('should clear alert played for the area', () => {
      const area = store.getState().createArea('Area 1');
      store.getState().markAlertPlayed(area.id);
      expect(store.getState().alertPlayed.has(area.id)).toBe(true);

      store.getState().resetTimer(area.id);
      expect(store.getState().alertPlayed.has(area.id)).toBe(false);
    });
  });

  describe('startAllTimers', () => {
    it('should start all timers', () => {
      store.getState().createArea('Area 1');
      store.getState().createArea('Area 2');
      store.getState().startAllTimers();

      const state = store.getState();
      expect(state.areas.every(a => a.isRunning)).toBe(true);
      expect(state.isAnyTimerRunning).toBe(true);
      expect(state.globalStartTime).not.toBeNull();
    });
  });

  describe('stopAllTimers', () => {
    it('should stop all running timers', () => {
      store.getState().createArea('Area 1');
      store.getState().createArea('Area 2');
      store.getState().startAllTimers();
      store.getState().stopAllTimers();

      const state = store.getState();
      expect(state.areas.every(a => !a.isRunning)).toBe(true);
      expect(state.isAnyTimerRunning).toBe(false);
    });
  });

  describe('pauseAllTimers', () => {
    it('should pause all running timers', () => {
      store.getState().createArea('Area 1');
      store.getState().createArea('Area 2');
      store.getState().startAllTimers();
      store.getState().pauseAllTimers();

      const state = store.getState();
      expect(state.areas.every(a => !a.isRunning && a.isPaused)).toBe(true);
      expect(state.isAnyTimerRunning).toBe(false);
    });
  });

  describe('setAreaTime', () => {
    it('should set elapsed time for an area', () => {
      const area = store.getState().createArea('Area 1');
      store.getState().setAreaTime(area.id, 45000);
      expect(store.getState().areas[0]!.elapsedTime).toBe(45000);
    });
  });

  describe('getTotalTime', () => {
    it('should return sum of all area elapsed times', () => {
      const area1 = store.getState().createArea('Area 1');
      const area2 = store.getState().createArea('Area 2');
      store.getState().setAreaTime(area1.id, 30000);
      store.getState().setAreaTime(area2.id, 45000);

      expect(store.getState().getTotalTime()).toBe(75000);
    });

    it('should return 0 when no areas exist', () => {
      expect(store.getState().getTotalTime()).toBe(0);
    });
  });

  describe('audio controls', () => {
    it('should toggle sound enabled', () => {
      store.getState().setSoundEnabled(false);
      expect(store.getState().soundEnabled).toBe(false);

      store.getState().setSoundEnabled(true);
      expect(store.getState().soundEnabled).toBe(true);
    });

    it('should set volume level', () => {
      store.getState().setVolumeLevel(0.5);
      expect(store.getState().volumeLevel).toBe(0.5);
    });

    it('should clamp volume between 0 and 1', () => {
      store.getState().setVolumeLevel(-0.5);
      expect(store.getState().volumeLevel).toBe(0);

      store.getState().setVolumeLevel(1.5);
      expect(store.getState().volumeLevel).toBe(1);
    });

    it('should track alert played per area', () => {
      const area = store.getState().createArea('Area 1');
      store.getState().markAlertPlayed(area.id);
      expect(store.getState().alertPlayed.has(area.id)).toBe(true);
    });
  });

  describe('getAreaById', () => {
    it('should return the area by id', () => {
      const area = store.getState().createArea('Area 1');
      const found = store.getState().getAreaById(area.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe('Area 1');
    });

    it('should return undefined for non-existent id', () => {
      expect(store.getState().getAreaById('nonexistent')).toBeUndefined();
    });
  });

  describe('getFormattedTime', () => {
    it('should format 0ms as 00:00.00', () => {
      expect(store.getState().getFormattedTime(0)).toBe('00:00.00');
    });

    it('should format 83450ms as 01:23.45', () => {
      expect(store.getState().getFormattedTime(83450)).toBe('01:23.45');
    });

    it('should format 5000ms as 00:05.00', () => {
      expect(store.getState().getFormattedTime(5000)).toBe('00:05.00');
    });

    it('should format 61234ms as 01:01.23', () => {
      expect(store.getState().getFormattedTime(61234)).toBe('01:01.23');
    });
  });

  describe('hasExceededMaxTime', () => {
    it('should return true when elapsed exceeds maxTime', () => {
      const area = store.getState().createArea('Area 1', 60000);
      store.getState().setAreaTime(area.id, 61000);
      expect(store.getState().hasExceededMaxTime(area.id)).toBe(true);
    });

    it('should return true when elapsed equals maxTime', () => {
      const area = store.getState().createArea('Area 1', 60000);
      store.getState().setAreaTime(area.id, 60000);
      expect(store.getState().hasExceededMaxTime(area.id)).toBe(true);
    });

    it('should return false when elapsed is under maxTime', () => {
      const area = store.getState().createArea('Area 1', 60000);
      store.getState().setAreaTime(area.id, 30000);
      expect(store.getState().hasExceededMaxTime(area.id)).toBe(false);
    });

    it('should return false when no maxTime is set', () => {
      const area = store.getState().createArea('Area 1');
      store.getState().setAreaTime(area.id, 999999);
      expect(store.getState().hasExceededMaxTime(area.id)).toBe(false);
    });

    it('should return false for non-existent area', () => {
      expect(store.getState().hasExceededMaxTime('nonexistent')).toBe(false);
    });
  });

  describe('edge cases', () => {
    describe('timer operations on non-running timers', () => {
      it('should not pause a timer that is not running', () => {
        const area = store.getState().createArea('Area 1');
        store.getState().pauseTimer(area.id);

        const updatedArea = store.getState().areas[0]!;
        expect(updatedArea.isRunning).toBe(false);
        expect(updatedArea.isPaused).toBe(false);
      });

      it('should not resume a timer that is not paused', () => {
        const area = store.getState().createArea('Area 1');
        const initialStartTime = store.getState().areas[0]!.startTime;

        store.getState().resumeTimer(area.id);

        const updatedArea = store.getState().areas[0]!;
        expect(updatedArea.startTime).toBe(initialStartTime);
        expect(updatedArea.isRunning).toBe(false);
      });

      it('should not stop a timer that is already stopped', () => {
        const area = store.getState().createArea('Area 1');
        store.getState().stopTimer(area.id);

        const updatedArea = store.getState().areas[0]!;
        expect(updatedArea.isRunning).toBe(false);
        expect(updatedArea.endTime).toBeNull();
      });
    });

    describe('concurrent multi-area timers', () => {
      it('should track multiple running timers independently', () => {
        let mockTime = 1000000;
        vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

        const area1 = store.getState().createArea('Container');
        const area2 = store.getState().createArea('Interior');
        const area3 = store.getState().createArea('Exterior');

        // Start area1
        store.getState().startTimer(area1.id);
        mockTime += 5000; // 5 seconds pass

        // Start area2
        store.getState().startTimer(area2.id);
        mockTime += 3000; // 3 more seconds pass

        // Start area3
        store.getState().startTimer(area3.id);
        mockTime += 2000; // 2 more seconds pass

        // Stop all and check independent elapsed times
        store.getState().stopTimer(area1.id);
        store.getState().stopTimer(area2.id);
        store.getState().stopTimer(area3.id);

        expect(store.getState().areas[0]!.elapsedTime).toBe(10000); // 5+3+2
        expect(store.getState().areas[1]!.elapsedTime).toBe(5000);  // 3+2
        expect(store.getState().areas[2]!.elapsedTime).toBe(2000);  // 2

        vi.restoreAllMocks();
      });

      it('should maintain isAnyTimerRunning with multiple timers', () => {
        const area1 = store.getState().createArea('Area 1');
        const area2 = store.getState().createArea('Area 2');

        store.getState().startTimer(area1.id);
        store.getState().startTimer(area2.id);
        expect(store.getState().isAnyTimerRunning).toBe(true);

        store.getState().stopTimer(area1.id);
        expect(store.getState().isAnyTimerRunning).toBe(true); // area2 still running

        store.getState().stopTimer(area2.id);
        expect(store.getState().isAnyTimerRunning).toBe(false); // all stopped
      });

      it('should handle starting multiple areas then stopping one', () => {
        store.getState().createArea('Area 1');
        const area2 = store.getState().createArea('Area 2');
        store.getState().createArea('Area 3');

        store.getState().startAllTimers();
        expect(store.getState().areas.every(a => a.isRunning)).toBe(true);

        store.getState().stopTimer(area2.id);
        expect(store.getState().areas[0]!.isRunning).toBe(true);
        expect(store.getState().areas[1]!.isRunning).toBe(false);
        expect(store.getState().areas[2]!.isRunning).toBe(true);
        expect(store.getState().isAnyTimerRunning).toBe(true);
      });
    });

    describe('pause and resume cycles', () => {
      it('should accumulate time across multiple pause/resume cycles', () => {
        let mockTime = 1000000;
        vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

        const area = store.getState().createArea('Area 1');

        // First cycle: run for 2s, pause
        store.getState().startTimer(area.id);
        mockTime += 2000;
        store.getState().pauseTimer(area.id);
        expect(store.getState().areas[0]!.elapsedTime).toBe(2000);

        // Second cycle: resume for 3s, pause
        mockTime += 1000; // Time passes while paused (should not count)
        store.getState().resumeTimer(area.id);
        mockTime += 3000;
        store.getState().pauseTimer(area.id);
        expect(store.getState().areas[0]!.elapsedTime).toBe(5000); // 2+3

        // Third cycle: resume for 4s, stop
        mockTime += 500; // More time passes while paused
        store.getState().resumeTimer(area.id);
        mockTime += 4000;
        store.getState().stopTimer(area.id);
        expect(store.getState().areas[0]!.elapsedTime).toBe(9000); // 2+3+4

        vi.restoreAllMocks();
      });

      it('should not add time while paused', () => {
        let mockTime = 1000000;
        vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

        const area = store.getState().createArea('Area 1');
        store.getState().startTimer(area.id);
        mockTime += 2000;
        store.getState().pauseTimer(area.id);

        const pausedElapsed = store.getState().areas[0]!.elapsedTime;

        // Time passes while paused
        mockTime += 10000;

        // Elapsed time should not change
        expect(store.getState().areas[0]!.elapsedTime).toBe(pausedElapsed);

        vi.restoreAllMocks();
      });
    });

    describe('updateElapsedTime', () => {
      it('should update elapsed time for running timer', () => {
        let mockTime = 1000000;
        vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

        const area = store.getState().createArea('Area 1');
        store.getState().startTimer(area.id);

        mockTime += 5000;
        store.getState().updateElapsedTime(area.id);

        expect(store.getState().areas[0]!.elapsedTime).toBe(5000);

        vi.restoreAllMocks();
      });

      it('should not update elapsed time for paused timer', () => {
        let mockTime = 1000000;
        vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

        const area = store.getState().createArea('Area 1');
        store.getState().startTimer(area.id);
        mockTime += 2000;
        store.getState().pauseTimer(area.id);

        mockTime += 5000;
        store.getState().updateElapsedTime(area.id);

        // Should still be 2000 (time when paused)
        expect(store.getState().areas[0]!.elapsedTime).toBe(2000);

        vi.restoreAllMocks();
      });

      it('should not update elapsed time for non-existent timer', () => {
        store.getState().updateElapsedTime('nonexistent');
        // Should not throw error
        expect(store.getState().areas).toEqual([]);
      });

      it('should handle timer without startTime', () => {
        const area = store.getState().createArea('Area 1');
        store.getState().updateElapsedTime(area.id);

        // Should not throw and should not change elapsed time
        expect(store.getState().areas[0]!.elapsedTime).toBe(0);
      });

      it('should accumulate elapsed time correctly with existing elapsed time', () => {
        let mockTime = 1000000;
        vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

        const area = store.getState().createArea('Area 1');

        // First run
        store.getState().startTimer(area.id);
        mockTime += 3000;
        store.getState().pauseTimer(area.id);

        // Resume and update
        store.getState().resumeTimer(area.id);
        mockTime += 2000;
        store.getState().updateElapsedTime(area.id);

        expect(store.getState().areas[0]!.elapsedTime).toBe(5000);

        vi.restoreAllMocks();
      });
    });

    describe('globalElapsedTime and globalStartTime', () => {
      it('should set globalStartTime only on first timer start', () => {
        let mockTime = 1000000;
        vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

        const area1 = store.getState().createArea('Area 1');
        const area2 = store.getState().createArea('Area 2');

        store.getState().startTimer(area1.id);
        const firstGlobalStart = store.getState().globalStartTime;

        mockTime += 5000;
        store.getState().startTimer(area2.id);

        // globalStartTime should not change
        expect(store.getState().globalStartTime).toBe(firstGlobalStart);

        vi.restoreAllMocks();
      });

      it('should update globalElapsedTime when last timer stops', () => {
        let mockTime = 1000000;
        vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

        const area = store.getState().createArea('Area 1');
        store.getState().startTimer(area.id);

        mockTime += 8000;
        store.getState().stopTimer(area.id);

        expect(store.getState().globalElapsedTime).toBe(8000);

        vi.restoreAllMocks();
      });

      it('should not update globalElapsedTime if other timers are still running', () => {
        let mockTime = 1000000;
        vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

        const area1 = store.getState().createArea('Area 1');
        const area2 = store.getState().createArea('Area 2');

        store.getState().startTimer(area1.id);
        store.getState().startTimer(area2.id);

        const initialGlobalElapsed = store.getState().globalElapsedTime;

        mockTime += 5000;
        store.getState().stopTimer(area1.id);

        // globalElapsedTime should not change because area2 is still running
        expect(store.getState().globalElapsedTime).toBe(initialGlobalElapsed);

        vi.restoreAllMocks();
      });
    });

    describe('time formatting edge cases', () => {
      it('should format large times correctly', () => {
        // 59 minutes, 59 seconds, 990 milliseconds
        expect(store.getState().getFormattedTime(3599990)).toBe('59:59.99');
      });

      it('should format times over 99 minutes', () => {
        // 100 minutes
        expect(store.getState().getFormattedTime(6000000)).toBe('100:00.00');
      });

      it('should handle milliseconds rounding', () => {
        // 1.235 seconds (should round down to 1.23)
        expect(store.getState().getFormattedTime(1235)).toBe('00:01.23');

        // 1.999 seconds (should show as 1.99)
        expect(store.getState().getFormattedTime(1999)).toBe('00:01.99');
      });

      it('should format single-digit milliseconds correctly', () => {
        // 5 milliseconds
        expect(store.getState().getFormattedTime(5)).toBe('00:00.00');

        // 95 milliseconds
        expect(store.getState().getFormattedTime(95)).toBe('00:00.09');
      });
    });

    describe('removeArea with active timer', () => {
      it('should not clear activeAreaId when removing non-active area', () => {
        const area1 = store.getState().createArea('Area 1');
        const area2 = store.getState().createArea('Area 2');

        store.getState().startTimer(area1.id);
        expect(store.getState().activeAreaId).toBe(area1.id);

        store.getState().removeArea(area2.id);
        expect(store.getState().activeAreaId).toBe(area1.id);
      });
    });

    describe('stopAllTimers with mixed states', () => {
      it('should stop only running timers and accumulate time', () => {
        let mockTime = 1000000;
        vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

        const area1 = store.getState().createArea('Area 1');
        const area2 = store.getState().createArea('Area 2');
        const area3 = store.getState().createArea('Area 3');

        // Start all
        store.getState().startTimer(area1.id);
        store.getState().startTimer(area2.id);
        store.getState().startTimer(area3.id);

        mockTime += 3000;

        // Pause area2
        store.getState().pauseTimer(area2.id);

        mockTime += 2000;

        // Stop all
        store.getState().stopAllTimers();

        // area1 should have 5s (3+2)
        expect(store.getState().areas[0]!.elapsedTime).toBe(5000);
        // area2 should have 3s (was paused after 3s)
        expect(store.getState().areas[1]!.elapsedTime).toBe(3000);
        // area3 should have 5s (3+2)
        expect(store.getState().areas[2]!.elapsedTime).toBe(5000);

        // All should be stopped
        expect(store.getState().areas.every(a => !a.isRunning)).toBe(true);

        vi.restoreAllMocks();
      });
    });

    describe('pauseAllTimers with mixed states', () => {
      it('should only pause running timers', () => {
        let mockTime = 1000000;
        vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

        const area1 = store.getState().createArea('Area 1');
        store.getState().createArea('Area 2');
        const area3 = store.getState().createArea('Area 3');

        // Start area1 and area3, leave area2 stopped
        store.getState().startTimer(area1.id);
        store.getState().startTimer(area3.id);

        mockTime += 4000;

        store.getState().pauseAllTimers();

        // area1 and area3 should be paused
        expect(store.getState().areas[0]!.isPaused).toBe(true);
        expect(store.getState().areas[0]!.elapsedTime).toBe(4000);

        // area2 should remain untouched (not running, not paused)
        expect(store.getState().areas[1]!.isPaused).toBe(false);
        expect(store.getState().areas[1]!.isRunning).toBe(false);
        expect(store.getState().areas[1]!.elapsedTime).toBe(0);

        expect(store.getState().areas[2]!.isPaused).toBe(true);
        expect(store.getState().areas[2]!.elapsedTime).toBe(4000);

        vi.restoreAllMocks();
      });
    });

    describe('alert tracking', () => {
      it('should persist alerts across multiple areas', () => {
        const area1 = store.getState().createArea('Area 1');
        const area2 = store.getState().createArea('Area 2');
        const area3 = store.getState().createArea('Area 3');

        store.getState().markAlertPlayed(area1.id);
        store.getState().markAlertPlayed(area3.id);

        expect(store.getState().alertPlayed.has(area1.id)).toBe(true);
        expect(store.getState().alertPlayed.has(area2.id)).toBe(false);
        expect(store.getState().alertPlayed.has(area3.id)).toBe(true);
      });

      it('should clear alerts when clearAllAreas is called', () => {
        const area1 = store.getState().createArea('Area 1');
        const area2 = store.getState().createArea('Area 2');

        store.getState().markAlertPlayed(area1.id);
        store.getState().markAlertPlayed(area2.id);

        store.getState().clearAllAreas();

        expect(store.getState().alertPlayed.size).toBe(0);
      });

      it('should only clear specific area alert on reset', () => {
        const area1 = store.getState().createArea('Area 1');
        const area2 = store.getState().createArea('Area 2');

        store.getState().markAlertPlayed(area1.id);
        store.getState().markAlertPlayed(area2.id);

        store.getState().resetTimer(area1.id);

        expect(store.getState().alertPlayed.has(area1.id)).toBe(false);
        expect(store.getState().alertPlayed.has(area2.id)).toBe(true);
      });
    });
  });
});
