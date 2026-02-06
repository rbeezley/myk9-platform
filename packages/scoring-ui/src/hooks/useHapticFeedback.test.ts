import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHapticFeedback, haptic } from './useHapticFeedback';

describe('useHapticFeedback', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    // Restore navigator
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  describe('when vibration is not supported', () => {
    beforeEach(() => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { ...originalNavigator, vibrate: undefined },
        writable: true,
        configurable: true,
      });
    });

    it('should report isSupported as false', () => {
      const { result } = renderHook(() => useHapticFeedback());
      expect(result.current.isSupported).toBe(false);
    });

    it('should not throw when calling haptic methods', () => {
      const { result } = renderHook(() => useHapticFeedback());
      expect(() => result.current.light()).not.toThrow();
      expect(() => result.current.medium()).not.toThrow();
      expect(() => result.current.heavy()).not.toThrow();
      expect(() => result.current.success()).not.toThrow();
      expect(() => result.current.error()).not.toThrow();
      expect(() => result.current.warning()).not.toThrow();
      expect(() => result.current.custom(100)).not.toThrow();
    });
  });

  describe('when vibration is supported', () => {
    let mockVibrate: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockVibrate = vi.fn(() => true);
      Object.defineProperty(globalThis, 'navigator', {
        value: { ...originalNavigator, vibrate: mockVibrate },
        writable: true,
        configurable: true,
      });
    });

    it('should report isSupported as true', () => {
      const { result } = renderHook(() => useHapticFeedback());
      expect(result.current.isSupported).toBe(true);
    });

    it('should call navigator.vibrate for light pattern', () => {
      const { result } = renderHook(() => useHapticFeedback());
      result.current.light();
      expect(mockVibrate).toHaveBeenCalledWith(50);
    });

    it('should call navigator.vibrate for medium pattern', () => {
      const { result } = renderHook(() => useHapticFeedback());
      result.current.medium();
      expect(mockVibrate).toHaveBeenCalledWith(75);
    });

    it('should call navigator.vibrate for heavy pattern', () => {
      const { result } = renderHook(() => useHapticFeedback());
      result.current.heavy();
      expect(mockVibrate).toHaveBeenCalledWith(100);
    });

    it('should call navigator.vibrate for success pattern', () => {
      const { result } = renderHook(() => useHapticFeedback());
      result.current.success();
      expect(mockVibrate).toHaveBeenCalledWith([50, 80, 50]);
    });

    it('should call navigator.vibrate for error pattern', () => {
      const { result } = renderHook(() => useHapticFeedback());
      result.current.error();
      expect(mockVibrate).toHaveBeenCalledWith([75, 80, 75, 80, 75]);
    });

    it('should call navigator.vibrate for warning pattern', () => {
      const { result } = renderHook(() => useHapticFeedback());
      result.current.warning();
      expect(mockVibrate).toHaveBeenCalledWith([50, 150, 50]);
    });

    it('should call navigator.vibrate for custom pattern', () => {
      const { result } = renderHook(() => useHapticFeedback());
      result.current.custom([100, 50, 100]);
      expect(mockVibrate).toHaveBeenCalledWith([100, 50, 100]);
    });

    it('should respect isEnabled check', () => {
      const { result } = renderHook(() =>
        useHapticFeedback(() => false)
      );

      result.current.light();
      expect(mockVibrate).not.toHaveBeenCalled();
    });

    it('should vibrate when isEnabled returns true', () => {
      const { result } = renderHook(() =>
        useHapticFeedback(() => true)
      );

      result.current.light();
      expect(mockVibrate).toHaveBeenCalled();
    });
  });
});

describe('haptic standalone', () => {
  it('should have all haptic methods', () => {
    expect(haptic.light).toBeDefined();
    expect(haptic.medium).toBeDefined();
    expect(haptic.heavy).toBeDefined();
    expect(haptic.success).toBeDefined();
    expect(haptic.error).toBeDefined();
    expect(haptic.warning).toBeDefined();
    expect(haptic.custom).toBeDefined();
    expect(typeof haptic.isSupported).toBe('boolean');
  });
});
