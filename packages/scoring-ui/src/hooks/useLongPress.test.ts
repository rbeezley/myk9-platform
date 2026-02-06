import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLongPress } from './useLongPress';

describe('useLongPress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return all required handlers', () => {
    const { result } = renderHook(() => useLongPress(vi.fn()));

    expect(result.current.onMouseDown).toBeDefined();
    expect(result.current.onMouseUp).toBeDefined();
    expect(result.current.onMouseLeave).toBeDefined();
    expect(result.current.onTouchStart).toBeDefined();
    expect(result.current.onTouchEnd).toBeDefined();
  });

  it('should trigger callback after default delay (800ms)', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => {
      result.current.onTouchStart({ } as React.TouchEvent);
    });

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('should trigger callback after custom delay', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress(onLongPress, { delay: 500 })
    );

    act(() => {
      result.current.onTouchStart({ } as React.TouchEvent);
    });

    act(() => {
      vi.advanceTimersByTime(499);
    });

    expect(onLongPress).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('should not trigger when released before delay', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => {
      result.current.onTouchStart({ } as React.TouchEvent);
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });

    act(() => {
      result.current.onTouchEnd({ } as React.TouchEvent);
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('should cancel on mouse leave', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => {
      result.current.onMouseDown({ button: 0 } as React.MouseEvent);
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });

    act(() => {
      result.current.onMouseLeave({ } as React.MouseEvent);
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('should not trigger for non-primary mouse button', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    // Right-click (button 2)
    act(() => {
      result.current.onMouseDown({ button: 2 } as React.MouseEvent);
    });

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('should not trigger when disabled', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress(onLongPress, { enabled: false })
    );

    act(() => {
      result.current.onTouchStart({ } as React.TouchEvent);
    });

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('should call onHaptic when long press triggers', () => {
    const onLongPress = vi.fn();
    const onHaptic = vi.fn();
    const { result } = renderHook(() =>
      useLongPress(onLongPress, { onHaptic })
    );

    act(() => {
      result.current.onTouchStart({ } as React.TouchEvent);
    });

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(onHaptic).toHaveBeenCalledTimes(1);
  });

  it('should call onLongPressStart when long press triggers', () => {
    const onLongPress = vi.fn();
    const onLongPressStart = vi.fn();
    const { result } = renderHook(() =>
      useLongPress(onLongPress, { onLongPressStart })
    );

    act(() => {
      result.current.onTouchStart({ } as React.TouchEvent);
    });

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(onLongPressStart).toHaveBeenCalledTimes(1);
  });

  it('should work with mouse down/up', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => {
      result.current.onMouseDown({ button: 0 } as React.MouseEvent);
    });

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('should cancel on mouse up before delay', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => {
      result.current.onMouseDown({ button: 0 } as React.MouseEvent);
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });

    act(() => {
      result.current.onMouseUp({ } as React.MouseEvent);
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });
});
