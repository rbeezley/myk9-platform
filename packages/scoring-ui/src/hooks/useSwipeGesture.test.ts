import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSwipeGesture, useSwipeToAction } from './useSwipeGesture';

// Helper to create mock touch events
function createTouchEvent(clientX: number, clientY: number) {
  return {
    touches: [{ clientX, clientY }],
    changedTouches: [{ clientX, clientY }],
    preventDefault: vi.fn(),
  };
}

function createMouseEvent(clientX: number, clientY: number) {
  return { clientX, clientY };
}

describe('useSwipeGesture', () => {
  it('should return all required handlers', () => {
    const { result } = renderHook(() => useSwipeGesture());

    expect(result.current.onTouchStart).toBeDefined();
    expect(result.current.onTouchEnd).toBeDefined();
    expect(result.current.onMouseDown).toBeDefined();
    expect(result.current.onMouseUp).toBeDefined();
  });

  it('should detect left swipe', () => {
    const onSwipeLeft = vi.fn();
    const { result } = renderHook(() =>
      useSwipeGesture({ onSwipeLeft, threshold: 50, maxTime: 1000 })
    );

    act(() => {
      result.current.onMouseDown(createMouseEvent(200, 100) as any);
    });

    act(() => {
      result.current.onMouseUp(createMouseEvent(100, 100) as any);
    });

    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
  });

  it('should detect right swipe', () => {
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() =>
      useSwipeGesture({ onSwipeRight, threshold: 50, maxTime: 1000 })
    );

    act(() => {
      result.current.onMouseDown(createMouseEvent(100, 100) as any);
    });

    act(() => {
      result.current.onMouseUp(createMouseEvent(200, 100) as any);
    });

    expect(onSwipeRight).toHaveBeenCalledTimes(1);
  });

  it('should detect up swipe', () => {
    const onSwipeUp = vi.fn();
    const { result } = renderHook(() =>
      useSwipeGesture({ onSwipeUp, threshold: 50, maxTime: 1000 })
    );

    act(() => {
      result.current.onMouseDown(createMouseEvent(100, 200) as any);
    });

    act(() => {
      result.current.onMouseUp(createMouseEvent(100, 100) as any);
    });

    expect(onSwipeUp).toHaveBeenCalledTimes(1);
  });

  it('should detect down swipe', () => {
    const onSwipeDown = vi.fn();
    const { result } = renderHook(() =>
      useSwipeGesture({ onSwipeDown, threshold: 50, maxTime: 1000 })
    );

    act(() => {
      result.current.onMouseDown(createMouseEvent(100, 100) as any);
    });

    act(() => {
      result.current.onMouseUp(createMouseEvent(100, 200) as any);
    });

    expect(onSwipeDown).toHaveBeenCalledTimes(1);
  });

  it('should call generic onSwipe with direction', () => {
    const onSwipe = vi.fn();
    const { result } = renderHook(() =>
      useSwipeGesture({ onSwipe, threshold: 50, maxTime: 1000 })
    );

    act(() => {
      result.current.onMouseDown(createMouseEvent(200, 100) as any);
    });

    act(() => {
      result.current.onMouseUp(createMouseEvent(100, 100) as any);
    });

    expect(onSwipe).toHaveBeenCalledWith('left');
  });

  it('should not trigger swipe below threshold', () => {
    const onSwipeLeft = vi.fn();
    const { result } = renderHook(() =>
      useSwipeGesture({ onSwipeLeft, threshold: 50, maxTime: 1000 })
    );

    act(() => {
      result.current.onMouseDown(createMouseEvent(100, 100) as any);
    });

    act(() => {
      // Only 30px movement, below 50px threshold
      result.current.onMouseUp(createMouseEvent(70, 100) as any);
    });

    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('should work with touch events', () => {
    const onSwipeLeft = vi.fn();
    const { result } = renderHook(() =>
      useSwipeGesture({ onSwipeLeft, threshold: 50, maxTime: 1000 })
    );

    act(() => {
      result.current.onTouchStart(createTouchEvent(200, 100) as any);
    });

    act(() => {
      result.current.onTouchEnd(createTouchEvent(100, 100) as any);
    });

    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
  });
});

describe('useSwipeToAction', () => {
  it('should return handlers and thresholds', () => {
    const { result } = renderHook(() => useSwipeToAction());

    expect(result.current.handlers).toBeDefined();
    expect(result.current.revealThreshold).toBe(80);
    expect(result.current.actionThreshold).toBe(200);
  });

  it('should use custom thresholds', () => {
    const { result } = renderHook(() =>
      useSwipeToAction({ revealThreshold: 100, actionThreshold: 250 })
    );

    expect(result.current.revealThreshold).toBe(100);
    expect(result.current.actionThreshold).toBe(250);
  });

  it('should execute left action when threshold reached', () => {
    const onAction = vi.fn();
    const { result } = renderHook(() =>
      useSwipeToAction({
        leftAction: { label: 'Delete', color: 'red', onAction },
        actionThreshold: 100,
      })
    );

    act(() => {
      result.current.handlers.onMouseDown(createMouseEvent(300, 100) as any);
    });

    act(() => {
      result.current.handlers.onMouseMove(createMouseEvent(100, 100) as any);
    });

    act(() => {
      result.current.handlers.onMouseUp();
    });

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('should execute right action when threshold reached', () => {
    const onAction = vi.fn();
    const { result } = renderHook(() =>
      useSwipeToAction({
        rightAction: { label: 'Complete', color: 'green', onAction },
        actionThreshold: 100,
      })
    );

    act(() => {
      result.current.handlers.onMouseDown(createMouseEvent(100, 100) as any);
    });

    act(() => {
      result.current.handlers.onMouseMove(createMouseEvent(300, 100) as any);
    });

    act(() => {
      result.current.handlers.onMouseUp();
    });

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('should not execute action when threshold not reached', () => {
    const onAction = vi.fn();
    const { result } = renderHook(() =>
      useSwipeToAction({
        leftAction: { label: 'Delete', color: 'red', onAction },
        actionThreshold: 200,
      })
    );

    act(() => {
      result.current.handlers.onMouseDown(createMouseEvent(200, 100) as any);
    });

    act(() => {
      result.current.handlers.onMouseMove(createMouseEvent(150, 100) as any);
    });

    act(() => {
      result.current.handlers.onMouseUp();
    });

    expect(onAction).not.toHaveBeenCalled();
  });

  it('should reset on mouse leave', () => {
    const { result } = renderHook(() => useSwipeToAction());

    act(() => {
      result.current.handlers.onMouseDown(createMouseEvent(200, 100) as any);
    });

    // Should not throw
    act(() => {
      const resetValue = result.current.handlers.onMouseLeave();
      expect(resetValue).toBe(0);
    });
  });
});
