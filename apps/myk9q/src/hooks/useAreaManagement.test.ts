/**
 * Tests for useAreaManagement Hook
 *
 * Tests area management logic for scent work scoring.
 */

import { renderHook, act } from '@testing-library/react';
import { useAreaManagement } from './useAreaManagement';
import type { AreaScore } from '../services/scoresheets/areaInitialization';

// Mock parseSmartTime
vi.mock('../utils/timeInputParsing', () => ({
  parseSmartTime: vi.fn((input: string) => {
    // Simple mock: convert "230" to "2:30", keep valid formats
    if (/^\d{3,4}$/.test(input)) {
      const mins = input.slice(0, -2);
      const secs = input.slice(-2);
      return `${mins}:${secs}`;
    }
    return input;
  })
}));

describe('useAreaManagement', () => {
  describe('Initialization', () => {
    it('should initialize with default area when no element/level provided', () => {
      const { result } = renderHook(() => useAreaManagement());

      // initializeAreas returns 1 default area when no element/level provided
      expect(result.current.areas).toHaveLength(1);
      expect(result.current.areas[0].areaName).toBe('Search Area');
      expect(result.current.totalTime).toBe('');
      expect(result.current.foundCount).toBe(0);
      expect(result.current.correctCount).toBe(0);
    });

    it('should initialize areas for Interior Novice (1 area)', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Novice' })
      );

      expect(result.current.areas).toHaveLength(1);
      expect(result.current.areas[0].areaName).toBe('Interior');
      expect(result.current.areas[0].time).toBe('');
      expect(result.current.areas[0].found).toBe(false);
      expect(result.current.areas[0].correct).toBe(false);
    });

    it('should initialize areas for Interior Excellent (2 areas)', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Excellent' })
      );

      expect(result.current.areas).toHaveLength(2);
      expect(result.current.areas[0].areaName).toBe('Interior Area 1');
      expect(result.current.areas[1].areaName).toBe('Interior Area 2');
    });

    it('should initialize areas for Interior Master (3 areas)', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Master' })
      );

      expect(result.current.areas).toHaveLength(3);
      expect(result.current.areas[0].areaName).toBe('Interior Area 1');
      expect(result.current.areas[1].areaName).toBe('Interior Area 2');
      expect(result.current.areas[2].areaName).toBe('Interior Area 3');
    });

    it('should initialize single area for Nationals mode (except Handler Disc)', () => {
      const { result } = renderHook(() =>
        useAreaManagement({
          element: 'Interior',
          level: 'Master',
          isNationalsMode: true
        })
      );

      expect(result.current.areas).toHaveLength(1);
      expect(result.current.areas[0].areaName).toBe('Interior');
    });

    it('should initialize single area for Container (all levels)', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Container', level: 'Master' })
      );

      expect(result.current.areas).toHaveLength(1);
      expect(result.current.areas[0].areaName).toBe('Container');
    });
  });

  describe('updateArea', () => {
    it('should update area time', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Novice' })
      );

      act(() => {
        result.current.updateArea(0, 'time', '2:30');
      });

      expect(result.current.areas[0].time).toBe('2:30');
    });

    it('should update area found status', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Novice' })
      );

      act(() => {
        result.current.updateArea(0, 'found', true);
      });

      expect(result.current.areas[0].found).toBe(true);
    });

    it('should update area correct status', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Novice' })
      );

      act(() => {
        result.current.updateArea(0, 'correct', true);
      });

      expect(result.current.areas[0].correct).toBe(true);
    });

    it('should only update specified area in multi-area scenario', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Excellent' })
      );

      act(() => {
        result.current.updateArea(0, 'time', '1:30');
      });

      expect(result.current.areas[0].time).toBe('1:30');
      expect(result.current.areas[1].time).toBe('');
    });

    it('should call onAreaTimeChange callback when time changes', () => {
      const onAreaTimeChange = vi.fn();
      const { result } = renderHook(() =>
        useAreaManagement({
          element: 'Interior',
          level: 'Novice',
          onAreaTimeChange
        })
      );

      act(() => {
        result.current.updateArea(0, 'time', '2:45');
      });

      expect(onAreaTimeChange).toHaveBeenCalledWith(0, '2:45');
    });

    it('should not call onAreaTimeChange when non-time field changes', () => {
      const onAreaTimeChange = vi.fn();
      const { result } = renderHook(() =>
        useAreaManagement({
          element: 'Interior',
          level: 'Novice',
          onAreaTimeChange
        })
      );

      act(() => {
        result.current.updateArea(0, 'found', true);
      });

      expect(onAreaTimeChange).not.toHaveBeenCalled();
    });
  });

  describe('handleTimeInput', () => {
    it('should update time with raw input', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Novice' })
      );

      act(() => {
        result.current.handleTimeInput(0, '2:');
      });

      expect(result.current.areas[0].time).toBe('2:');
    });

    it('should handle partial input during typing', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Novice' })
      );

      act(() => {
        result.current.handleTimeInput(0, '2');
        result.current.handleTimeInput(0, '2:');
        result.current.handleTimeInput(0, '2:3');
        result.current.handleTimeInput(0, '2:30');
      });

      expect(result.current.areas[0].time).toBe('2:30');
    });
  });

  describe('handleTimeBlur', () => {
    it('should apply smart parsing on blur', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Novice' })
      );

      act(() => {
        result.current.handleTimeBlur(0, '230');
      });

      // Mock parseSmartTime converts "230" to "2:30"
      expect(result.current.areas[0].time).toBe('2:30');
    });

    it('should keep valid format unchanged', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Novice' })
      );

      act(() => {
        result.current.handleTimeBlur(0, '2:45');
      });

      expect(result.current.areas[0].time).toBe('2:45');
    });
  });

  describe('clearTime', () => {
    it('should clear time for specified area', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Novice' })
      );

      act(() => {
        result.current.updateArea(0, 'time', '2:30');
        result.current.clearTime(0);
      });

      expect(result.current.areas[0].time).toBe('');
    });

    it('should only clear specified area in multi-area scenario', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Excellent' })
      );

      act(() => {
        result.current.updateArea(0, 'time', '1:30');
        result.current.updateArea(1, 'time', '2:00');
        result.current.clearTime(0);
      });

      expect(result.current.areas[0].time).toBe('');
      expect(result.current.areas[1].time).toBe('2:00');
    });
  });

  describe('initializeForClass', () => {
    it('should reinitialize areas for new element/level', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Container', level: 'Novice' })
      );

      expect(result.current.areas).toHaveLength(1);

      act(() => {
        result.current.initializeForClass('Interior', 'Master');
      });

      expect(result.current.areas).toHaveLength(3);
      expect(result.current.areas[0].areaName).toBe('Interior Area 1');
    });

    it('should clear existing times when reinitializing', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Novice' })
      );

      act(() => {
        result.current.updateArea(0, 'time', '2:30');
        result.current.initializeForClass('Container', 'Advanced');
      });

      expect(result.current.areas[0].time).toBe('');
    });
  });

  describe('setAreas', () => {
    it('should replace all areas with provided data', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Novice' })
      );

      const newAreas: AreaScore[] = [
        { areaName: 'Custom Area 1', time: '1:30', found: true, correct: true },
        { areaName: 'Custom Area 2', time: '2:00', found: true, correct: false }
      ];

      act(() => {
        result.current.setAreas(newAreas);
      });

      expect(result.current.areas).toEqual(newAreas);
    });
  });

  describe('totalTime', () => {
    it('should return empty string when no times entered', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Novice' })
      );

      expect(result.current.totalTime).toBe('');
    });

    it('should calculate total for single area', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Novice' })
      );

      act(() => {
        result.current.updateArea(0, 'time', '2:30');
      });

      expect(result.current.totalTime).toBe('2:30');
    });

    it('should calculate total for multiple areas', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Excellent' })
      );

      act(() => {
        result.current.updateArea(0, 'time', '1:30'); // 90 seconds
        result.current.updateArea(1, 'time', '2:15'); // 135 seconds
      });

      // Total: 90 + 135 = 225 seconds = 3:45
      expect(result.current.totalTime).toBe('3:45');
    });

    it('should handle times with decimal seconds', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Excellent' })
      );

      act(() => {
        result.current.updateArea(0, 'time', '1:30.50');
        result.current.updateArea(1, 'time', '1:30.50');
      });

      // Total: 90.5 + 90.5 = 181 seconds, rounded to 182 = 3:02
      expect(result.current.totalTime).toBe('3:02');
    });

    it('should ignore empty times in calculation', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Excellent' })
      );

      act(() => {
        result.current.updateArea(0, 'time', '2:00');
        result.current.updateArea(1, 'time', '');
      });

      expect(result.current.totalTime).toBe('2:00');
    });

    it('should format time correctly when minutes > 9', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Master' })
      );

      act(() => {
        result.current.updateArea(0, 'time', '3:20');
        result.current.updateArea(1, 'time', '4:15');
        result.current.updateArea(2, 'time', '5:30');
      });

      // Total: 200 + 255 + 330 = 785 seconds = 13:05
      expect(result.current.totalTime).toBe('13:05');
    });
  });

  describe('foundCount', () => {
    it('should return 0 when no areas found', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Novice' })
      );

      expect(result.current.foundCount).toBe(0);
    });

    it('should count areas marked as found', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Excellent' })
      );

      act(() => {
        result.current.updateArea(0, 'found', true);
        result.current.updateArea(1, 'found', false);
      });

      expect(result.current.foundCount).toBe(1);
    });

    it('should count all found areas', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Master' })
      );

      act(() => {
        result.current.updateArea(0, 'found', true);
        result.current.updateArea(1, 'found', true);
        result.current.updateArea(2, 'found', true);
      });

      expect(result.current.foundCount).toBe(3);
    });
  });

  describe('correctCount', () => {
    it('should return 0 when no areas correct', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Novice' })
      );

      expect(result.current.correctCount).toBe(0);
    });

    it('should count areas marked as correct', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Excellent' })
      );

      act(() => {
        result.current.updateArea(0, 'correct', true);
        result.current.updateArea(1, 'correct', false);
      });

      expect(result.current.correctCount).toBe(1);
    });

    it('should distinguish between found and correct', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Excellent' })
      );

      act(() => {
        result.current.updateArea(0, 'found', true);
        result.current.updateArea(0, 'correct', true);
        result.current.updateArea(1, 'found', true);
        result.current.updateArea(1, 'correct', false);
      });

      expect(result.current.foundCount).toBe(2);
      expect(result.current.correctCount).toBe(1);
    });
  });

  describe('reset', () => {
    it('should reset all areas to initial state', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Excellent' })
      );

      act(() => {
        result.current.updateArea(0, 'time', '1:30');
        result.current.updateArea(0, 'found', true);
        result.current.updateArea(0, 'correct', true);
        result.current.updateArea(1, 'time', '2:00');
        result.current.reset();
      });

      expect(result.current.areas[0].time).toBe('');
      expect(result.current.areas[0].found).toBe(false);
      expect(result.current.areas[0].correct).toBe(false);
      expect(result.current.areas[1].time).toBe('');
      expect(result.current.totalTime).toBe('');
    });

    it('should maintain area count after reset', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Master' })
      );

      expect(result.current.areas).toHaveLength(3);

      act(() => {
        result.current.reset();
      });

      expect(result.current.areas).toHaveLength(3);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle complete Interior Master scoring', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Master' })
      );

      act(() => {
        result.current.updateArea(0, 'time', '1:15');
        result.current.updateArea(0, 'found', true);
        result.current.updateArea(0, 'correct', true);
        result.current.updateArea(1, 'time', '1:30');
        result.current.updateArea(1, 'found', true);
        result.current.updateArea(1, 'correct', true);
        result.current.updateArea(2, 'time', '1:45');
        result.current.updateArea(2, 'found', true);
        result.current.updateArea(2, 'correct', true);
      });

      expect(result.current.totalTime).toBe('4:30'); // 75 + 90 + 105 = 270 sec
      expect(result.current.foundCount).toBe(3);
      expect(result.current.correctCount).toBe(3);
    });

    it('should handle partial finds (some incorrect)', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Excellent' })
      );

      act(() => {
        result.current.updateArea(0, 'time', '2:00');
        result.current.updateArea(0, 'found', true);
        result.current.updateArea(0, 'correct', true);
        result.current.updateArea(1, 'time', '1:30');
        result.current.updateArea(1, 'found', true);
        result.current.updateArea(1, 'correct', false); // False alert
      });

      expect(result.current.foundCount).toBe(2);
      expect(result.current.correctCount).toBe(1);
      expect(result.current.totalTime).toBe('3:30');
    });

    it('should handle typing simulation with blur', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Novice' })
      );

      act(() => {
        // Simulate user typing "230"
        result.current.handleTimeInput(0, '2');
        result.current.handleTimeInput(0, '23');
        result.current.handleTimeInput(0, '230');
      });

      expect(result.current.areas[0].time).toBe('230');

      act(() => {
        // Simulate blur (smart parsing)
        result.current.handleTimeBlur(0, '230');
      });

      expect(result.current.areas[0].time).toBe('2:30');
    });

    it('should handle switching between classes mid-scoring', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Container', level: 'Novice' })
      );

      act(() => {
        result.current.updateArea(0, 'time', '1:30');
      });

      expect(result.current.areas).toHaveLength(1);
      expect(result.current.totalTime).toBe('1:30');

      act(() => {
        // Switch to Interior Master
        result.current.initializeForClass('Interior', 'Master');
      });

      expect(result.current.areas).toHaveLength(3);
      expect(result.current.totalTime).toBe(''); // Reset
    });

    it('should handle loading saved scoresheet data', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Excellent' })
      );

      const savedAreas: AreaScore[] = [
        { areaName: 'Interior Area 1', time: '1:45', found: true, correct: true },
        { areaName: 'Interior Area 2', time: '2:10', found: true, correct: true }
      ];

      act(() => {
        result.current.setAreas(savedAreas);
      });

      expect(result.current.totalTime).toBe('3:55'); // 105 + 130 = 235 seconds
      expect(result.current.foundCount).toBe(2);
      expect(result.current.correctCount).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle updating non-existent area index gracefully', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Novice' })
      );

      act(() => {
        result.current.updateArea(5, 'time', '2:00');
      });

      // Should not throw, just not update anything
      expect(result.current.areas[0].time).toBe('');
    });

    it('should handle zero seconds in time', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Novice' })
      );

      act(() => {
        result.current.updateArea(0, 'time', '0:00');
      });

      expect(result.current.totalTime).toBe('');
    });

    it('should handle very large time values', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Novice' })
      );

      act(() => {
        result.current.updateArea(0, 'time', '99:59');
      });

      expect(result.current.totalTime).toBe('99:59');
    });

    it('should handle rapid consecutive updates', () => {
      const { result } = renderHook(() =>
        useAreaManagement({ element: 'Interior', level: 'Excellent' })
      );

      act(() => {
        for (let i = 0; i < 10; i++) {
          result.current.updateArea(0, 'found', i % 2 === 0);
        }
      });

      // Loop ends with i=9, so 9 % 2 === 0 is false
      expect(result.current.areas[0].found).toBe(false);
    });
  });
});
