/**
 * Tests for useNationalsCounters Hook
 *
 * Tests Nationals-specific scoring counter logic and point calculations.
 */

import { renderHook, act } from '@testing-library/react';
import { useNationalsCounters } from './useNationalsCounters';

describe('useNationalsCounters', () => {
  describe('Initialization', () => {
    it('should initialize with zero counters', () => {
      const { result } = renderHook(() => useNationalsCounters());

      expect(result.current.alertsCorrect).toBe(0);
      expect(result.current.alertsIncorrect).toBe(0);
      expect(result.current.finishCallErrors).toBe(0);
      expect(result.current.isExcused).toBe(false);
      expect(result.current.totalPoints).toBe(0);
    });

    it('should accept options without errors', () => {
      const onAlertsChange = vi.fn();
      const { result } = renderHook(() =>
        useNationalsCounters({
          faultCount: 2,
          onAlertsChange
        })
      );

      // With 0 alerts and 2 faults: (0 × 10) - (2 × 2) = -4 points
      expect(result.current.totalPoints).toBe(-4);
    });
  });

  describe('Point Calculation', () => {
    it('should calculate points for correct alerts only', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.setAlertsCorrect(3);
      });

      // 3 correct × 10 points = 30 points
      expect(result.current.totalPoints).toBe(30);
    });

    it('should calculate penalties for incorrect alerts', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.setAlertsCorrect(3);
        result.current.setAlertsIncorrect(2);
      });

      // (3 × 10) - (2 × 5) = 30 - 10 = 20 points
      expect(result.current.totalPoints).toBe(20);
    });

    it('should calculate penalties for finish call errors', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.setAlertsCorrect(4);
        result.current.setFinishCallErrors(1);
      });

      // (4 × 10) - (1 × 5) = 40 - 5 = 35 points
      expect(result.current.totalPoints).toBe(35);
    });

    it('should calculate penalties for faults', () => {
      const { result } = renderHook(() =>
        useNationalsCounters({ faultCount: 3 })
      );

      act(() => {
        result.current.setAlertsCorrect(5);
      });

      // (5 × 10) - (3 × 2) = 50 - 6 = 44 points
      expect(result.current.totalPoints).toBe(44);
    });

    it('should calculate complex scoring scenario', () => {
      const { result } = renderHook(() =>
        useNationalsCounters({ faultCount: 2 })
      );

      act(() => {
        result.current.setAlertsCorrect(4);
        result.current.setAlertsIncorrect(1);
        result.current.setFinishCallErrors(2);
      });

      // (4 × 10) - (1 × 5) - (2 × 5) - (2 × 2)
      // = 40 - 5 - 10 - 4 = 21 points
      expect(result.current.totalPoints).toBe(21);
    });

    it('should return 0 points when excused', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.setAlertsCorrect(5);
        result.current.setIsExcused(true);
      });

      expect(result.current.totalPoints).toBe(0);
    });

    it('should allow negative total points', () => {
      const { result } = renderHook(() =>
        useNationalsCounters({ faultCount: 10 })
      );

      act(() => {
        result.current.setAlertsCorrect(1);
        result.current.setAlertsIncorrect(5);
        result.current.setFinishCallErrors(3);
      });

      // (1 × 10) - (5 × 5) - (3 × 5) - (10 × 2)
      // = 10 - 25 - 15 - 20 = -50 points
      expect(result.current.totalPoints).toBe(-50);
    });
  });

  describe('Increment/Decrement Methods', () => {
    it('should increment correct alerts', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.incrementCorrect();
        result.current.incrementCorrect();
      });

      expect(result.current.alertsCorrect).toBe(2);
      expect(result.current.totalPoints).toBe(20);
    });

    it('should decrement correct alerts', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.setAlertsCorrect(5);
        result.current.decrementCorrect();
        result.current.decrementCorrect();
      });

      expect(result.current.alertsCorrect).toBe(3);
      expect(result.current.totalPoints).toBe(30);
    });

    it('should not decrement correct alerts below 0', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.decrementCorrect();
        result.current.decrementCorrect();
      });

      expect(result.current.alertsCorrect).toBe(0);
    });

    it('should increment incorrect alerts', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.incrementIncorrect();
        result.current.incrementIncorrect();
      });

      expect(result.current.alertsIncorrect).toBe(2);
      expect(result.current.totalPoints).toBe(-10);
    });

    it('should decrement incorrect alerts', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.setAlertsIncorrect(3);
        result.current.decrementIncorrect();
      });

      expect(result.current.alertsIncorrect).toBe(2);
    });

    it('should not decrement incorrect alerts below 0', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.decrementIncorrect();
      });

      expect(result.current.alertsIncorrect).toBe(0);
    });

    it('should increment finish call errors', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.incrementFinishErrors();
      });

      expect(result.current.finishCallErrors).toBe(1);
      expect(result.current.totalPoints).toBe(-5);
    });

    it('should decrement finish call errors', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.setFinishCallErrors(3);
        result.current.decrementFinishErrors();
      });

      expect(result.current.finishCallErrors).toBe(2);
    });

    it('should not decrement finish call errors below 0', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.decrementFinishErrors();
      });

      expect(result.current.finishCallErrors).toBe(0);
    });
  });

  describe('Setter Methods', () => {
    it('should set alerts correct with direct value', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.setAlertsCorrect(5);
      });

      expect(result.current.alertsCorrect).toBe(5);
    });

    it('should set alerts correct with function', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.setAlertsCorrect(3);
        result.current.setAlertsCorrect((prev) => prev + 2);
      });

      expect(result.current.alertsCorrect).toBe(5);
    });

    it('should set alerts incorrect with direct value', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.setAlertsIncorrect(2);
      });

      expect(result.current.alertsIncorrect).toBe(2);
    });

    it('should set finish call errors with direct value', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.setFinishCallErrors(1);
      });

      expect(result.current.finishCallErrors).toBe(1);
    });

    it('should set excused status', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.setIsExcused(true);
      });

      expect(result.current.isExcused).toBe(true);
    });

    it('should set excused status with function', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.setIsExcused((prev) => !prev);
      });

      expect(result.current.isExcused).toBe(true);
    });
  });

  describe('Reset Method', () => {
    it('should reset all counters to zero', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.setAlertsCorrect(5);
        result.current.setAlertsIncorrect(3);
        result.current.setFinishCallErrors(2);
        result.current.setIsExcused(true);
      });

      expect(result.current.totalPoints).toBe(0); // excused

      act(() => {
        result.current.reset();
      });

      expect(result.current.alertsCorrect).toBe(0);
      expect(result.current.alertsIncorrect).toBe(0);
      expect(result.current.finishCallErrors).toBe(0);
      expect(result.current.isExcused).toBe(false);
      expect(result.current.totalPoints).toBe(0);
    });
  });

  describe('onAlertsChange Callback', () => {
    it('should call onAlertsChange when alerts change', () => {
      const onAlertsChange = vi.fn();
      const { result } = renderHook(() =>
        useNationalsCounters({ onAlertsChange })
      );

      act(() => {
        result.current.setAlertsCorrect(3);
      });

      expect(onAlertsChange).toHaveBeenCalledWith(3, 0);
    });

    it('should call onAlertsChange when incorrect alerts change', () => {
      const onAlertsChange = vi.fn();
      const { result } = renderHook(() =>
        useNationalsCounters({ onAlertsChange })
      );

      act(() => {
        result.current.setAlertsIncorrect(2);
      });

      expect(onAlertsChange).toHaveBeenCalledWith(0, 2);
    });

    it('should call onAlertsChange when both alerts change', () => {
      const onAlertsChange = vi.fn();
      const { result } = renderHook(() =>
        useNationalsCounters({ onAlertsChange })
      );

      act(() => {
        result.current.setAlertsCorrect(4);
        result.current.setAlertsIncorrect(1);
      });

      expect(onAlertsChange).toHaveBeenCalledWith(4, 1);
    });

    it('should not call onAlertsChange when finish errors change', () => {
      const onAlertsChange = vi.fn();
      const { result } = renderHook(() =>
        useNationalsCounters({ onAlertsChange })
      );

      onAlertsChange.mockClear();

      act(() => {
        result.current.setFinishCallErrors(2);
      });

      expect(onAlertsChange).not.toHaveBeenCalled();
    });

    it('should not call onAlertsChange when excused changes', () => {
      const onAlertsChange = vi.fn();
      const { result } = renderHook(() =>
        useNationalsCounters({ onAlertsChange })
      );

      onAlertsChange.mockClear();

      act(() => {
        result.current.setIsExcused(true);
      });

      expect(onAlertsChange).not.toHaveBeenCalled();
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle perfect run (all correct, no penalties)', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.setAlertsCorrect(4);
      });

      expect(result.current.totalPoints).toBe(40);
    });

    it('should handle run with one incorrect alert', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.setAlertsCorrect(3);
        result.current.setAlertsIncorrect(1);
      });

      // (3 × 10) - (1 × 5) = 25 points
      expect(result.current.totalPoints).toBe(25);
    });

    it('should handle run with finish call error and faults', () => {
      const { result } = renderHook(() =>
        useNationalsCounters({ faultCount: 1 })
      );

      act(() => {
        result.current.setAlertsCorrect(4);
        result.current.setFinishCallErrors(1);
      });

      // (4 × 10) - (1 × 5) - (1 × 2) = 33 points
      expect(result.current.totalPoints).toBe(33);
    });

    it('should handle excused dog (overrides all points)', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.setAlertsCorrect(4);
        result.current.setIsExcused(true);
      });

      expect(result.current.totalPoints).toBe(0);
    });

    it('should update points when un-excusing a dog', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.setAlertsCorrect(3);
        result.current.setIsExcused(true);
      });

      expect(result.current.totalPoints).toBe(0);

      act(() => {
        result.current.setIsExcused(false);
      });

      expect(result.current.totalPoints).toBe(30);
    });

    it('should handle changing fault count dynamically', () => {
      const { result, rerender } = renderHook(
        ({ faultCount }) => useNationalsCounters({ faultCount }),
        { initialProps: { faultCount: 0 } }
      );

      act(() => {
        result.current.setAlertsCorrect(5);
      });

      expect(result.current.totalPoints).toBe(50);

      // Simulate faults being added
      rerender({ faultCount: 2 });

      // (5 × 10) - (2 × 2) = 46 points
      expect(result.current.totalPoints).toBe(46);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero counters correctly', () => {
      const { result } = renderHook(() => useNationalsCounters());

      expect(result.current.totalPoints).toBe(0);
    });

    it('should handle setting counters to zero explicitly', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.setAlertsCorrect(5);
        result.current.setAlertsCorrect(0);
      });

      expect(result.current.totalPoints).toBe(0);
    });

    it('should handle very large counter values', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.setAlertsCorrect(100);
      });

      expect(result.current.totalPoints).toBe(1000);
    });

    it('should handle rapid increments', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        for (let i = 0; i < 10; i++) {
          result.current.incrementCorrect();
        }
      });

      expect(result.current.alertsCorrect).toBe(10);
      expect(result.current.totalPoints).toBe(100);
    });

    it('should handle multiple resets', () => {
      const { result } = renderHook(() => useNationalsCounters());

      act(() => {
        result.current.setAlertsCorrect(5);
        result.current.reset();
        result.current.setAlertsCorrect(3);
        result.current.reset();
      });

      expect(result.current.alertsCorrect).toBe(0);
      expect(result.current.totalPoints).toBe(0);
    });
  });
});
