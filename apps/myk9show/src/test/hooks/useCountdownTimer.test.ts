/**
 * Unit tests for useCountdownTimer hook
 * 
 * Tests timer accuracy, warning triggers, and state management
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCountdownTimer } from '@/hooks/useCountdownTimer';

// Mock the time formatting utilities
vi.mock('@/lib/timeUtils', () => ({
  formatTimePrecise: (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hundredths = Math.floor((ms % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
  },
  formatTimeMinutes: (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
}));

describe('useCountdownTimer', () => {
  const mockOnTimeWarning = vi.fn();
  const mockOnTimeExpired = vi.fn();
  const mockOnSearchTime = vi.fn();

  const defaultProps = {
    maxTimeMs: 120000, // 2 minutes
    level: 'Novice' as const,
    onTimeWarning: mockOnTimeWarning,
    onTimeExpired: mockOnTimeExpired,
    onSearchTime: mockOnSearchTime,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useCountdownTimer(defaultProps));

    expect(result.current.searchTime).toBe(0);
    expect(result.current.remainingTime).toBe(120000);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isWarning).toBe(false);
    expect(result.current.isExpired).toBe(false);
  });

  it('should start timer and update search time', async () => {
    const { result } = renderHook(() => useCountdownTimer(defaultProps));

    act(() => {
      result.current.start();
    });

    expect(result.current.isRunning).toBe(true);

    // Advance time by 1 second
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.searchTime).toBeGreaterThan(990); // Allow for timing variance
    expect(result.current.searchTime).toBeLessThan(1010);
  });

  it('should stop timer when stop is called', () => {
    const { result } = renderHook(() => useCountdownTimer(defaultProps));

    act(() => {
      result.current.start();
    });

    expect(result.current.isRunning).toBe(true);

    act(() => {
      result.current.stop();
    });

    expect(result.current.isRunning).toBe(false);
    expect(mockOnSearchTime).toHaveBeenCalled();
  });

  it('should reset timer to initial state', () => {
    const { result } = renderHook(() => useCountdownTimer(defaultProps));

    // Start and run timer
    act(() => {
      result.current.start();
    });

    // Advance time
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.searchTime).toBeGreaterThan(0);

    // Reset timer
    act(() => {
      result.current.reset();
    });

    expect(result.current.searchTime).toBe(0);
    expect(result.current.remainingTime).toBe(120000);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isWarning).toBe(false);
    expect(result.current.isExpired).toBe(false);
  });

  it('should trigger warning at 30 seconds for non-Masters levels', () => {
    const { result } = renderHook(() => useCountdownTimer(defaultProps));

    act(() => {
      result.current.start();
    });

    // Advance to 90 seconds (30 seconds remaining)
    act(() => {
      vi.advanceTimersByTime(90000);
    });

    expect(result.current.isWarning).toBe(true);
    expect(mockOnTimeWarning).toHaveBeenCalled();
  });

  it('should not trigger warning for Masters level', () => {
    const mastersProps = { ...defaultProps, level: 'Masters' as const };
    const { result } = renderHook(() => useCountdownTimer(mastersProps));

    act(() => {
      result.current.start();
    });

    // Advance to 90 seconds (30 seconds remaining)
    act(() => {
      vi.advanceTimersByTime(90000);
    });

    expect(result.current.isWarning).toBe(false);
    expect(mockOnTimeWarning).not.toHaveBeenCalled();
  });

  it('should trigger time expired when time limit exceeded', () => {
    const { result } = renderHook(() => useCountdownTimer(defaultProps));

    act(() => {
      result.current.start();
    });

    // Advance past the 2-minute limit
    act(() => {
      vi.advanceTimersByTime(125000);
    });

    expect(result.current.isExpired).toBe(true);
    expect(result.current.remainingTime).toBe(0);
    expect(mockOnTimeExpired).toHaveBeenCalled();
  });

  it('should display formatted time correctly', () => {
    const { result } = renderHook(() => useCountdownTimer(defaultProps));

    act(() => {
      result.current.start();
    });

    // Advance time by 75.39 seconds
    act(() => {
      vi.advanceTimersByTime(75390);
    });

    expect(result.current.searchTimeDisplay).toBe('01:15.39');
  });

  it('should calculate remaining time correctly', () => {
    const { result } = renderHook(() => useCountdownTimer(defaultProps));

    act(() => {
      result.current.start();
    });

    // Advance time by 30 seconds
    act(() => {
      vi.advanceTimersByTime(30000);
    });

    expect(result.current.remainingTime).toBe(90000); // 90 seconds remaining
    expect(result.current.remainingTimeDisplay).toBe('01:30');
  });

  it('should handle precision parameter', () => {
    const precisionProps = { ...defaultProps, precision: 100 };
    const { result } = renderHook(() => useCountdownTimer(precisionProps));

    act(() => {
      result.current.start();
    });

    expect(result.current.isRunning).toBe(true);
    
    // With 100ms precision, timer should still work
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.searchTime).toBeGreaterThan(900);
  });

  it('should cleanup on unmount', () => {
    const { result, unmount } = renderHook(() => useCountdownTimer(defaultProps));

    act(() => {
      result.current.start();
    });

    expect(result.current.isRunning).toBe(true);

    unmount();

    // Should not throw errors after unmount
    expect(() => {
      vi.advanceTimersByTime(1000);
    }).not.toThrow();
  });
});