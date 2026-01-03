/**
 * Tests for useSelfCheckinSettings Hook
 */

import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useSelfCheckinSettings } from './useSelfCheckinSettings';
import * as resultVisibilityService from '@/services/resultVisibilityService';

// Mock the result visibility service
vi.mock('@/services/resultVisibilityService');

describe('useSelfCheckinSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useSelfCheckinSettings());

      expect(result.current.showSelfCheckinEnabled).toBe(true);
      expect(result.current.trialSelfCheckinSettings).toEqual(new Map());
      expect(result.current.checkinSectionExpanded).toBe(false);
    });

    it('should provide all required methods', () => {
      const { result } = renderHook(() => useSelfCheckinSettings());

      expect(typeof result.current.setShowSelfCheckinEnabled).toBe('function');
      expect(typeof result.current.setTrialSelfCheckinSettings).toBe('function');
      expect(typeof result.current.setCheckinSectionExpanded).toBe('function');
      expect(typeof result.current.handleSetShowSelfCheckin).toBe('function');
      expect(typeof result.current.handleSetTrialSelfCheckin).toBe('function');
      expect(typeof result.current.handleRemoveTrialSelfCheckin).toBe('function');
    });
  });

  describe('Show-level self check-in', () => {
    it('should enable show self check-in successfully', async () => {
      vi.mocked(resultVisibilityService.setShowSelfCheckin).mockResolvedValue();

      const { result } = renderHook(() => useSelfCheckinSettings());

      let setResult;
      await act(async () => {
        setResult = await result.current.handleSetShowSelfCheckin(true, 'license-123');
      });

      expect(setResult).toEqual({ success: true });
      expect(result.current.showSelfCheckinEnabled).toBe(true);
      expect(resultVisibilityService.setShowSelfCheckin).toHaveBeenCalledWith('license-123', true);
    });

    it('should disable show self check-in successfully', async () => {
      vi.mocked(resultVisibilityService.setShowSelfCheckin).mockResolvedValue();

      const { result } = renderHook(() => useSelfCheckinSettings());

      let setResult;
      await act(async () => {
        setResult = await result.current.handleSetShowSelfCheckin(false, 'license-456');
      });

      expect(setResult).toEqual({ success: true });
      expect(result.current.showSelfCheckinEnabled).toBe(false);
      expect(resultVisibilityService.setShowSelfCheckin).toHaveBeenCalledWith('license-456', false);
    });

    it('should handle show self check-in errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(resultVisibilityService.setShowSelfCheckin).mockRejectedValue(new Error('Service error'));

      const { result } = renderHook(() => useSelfCheckinSettings());

      let setResult;
      await act(async () => {
        setResult = await result.current.handleSetShowSelfCheckin(false, 'license-789');
      });

      expect(setResult).toEqual({
        success: false,
        error: 'Service error'
      });
      expect(result.current.showSelfCheckinEnabled).toBe(true); // Should remain unchanged
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should toggle between enabled and disabled', async () => {
      vi.mocked(resultVisibilityService.setShowSelfCheckin).mockResolvedValue();

      const { result } = renderHook(() => useSelfCheckinSettings());

      // Disable
      await act(async () => {
        await result.current.handleSetShowSelfCheckin(false, 'license-123');
      });
      expect(result.current.showSelfCheckinEnabled).toBe(false);

      // Re-enable
      await act(async () => {
        await result.current.handleSetShowSelfCheckin(true, 'license-123');
      });
      expect(result.current.showSelfCheckinEnabled).toBe(true);
    });
  });

  describe('Trial-level self check-in', () => {
    it('should set trial self check-in override successfully', async () => {
      vi.mocked(resultVisibilityService.setTrialSelfCheckin).mockResolvedValue();

      const { result } = renderHook(() => useSelfCheckinSettings());

      let setResult;
      await act(async () => {
        setResult = await result.current.handleSetTrialSelfCheckin(1, true, 'Trial 1');
      });

      expect(setResult).toEqual({ success: true });
      expect(result.current.trialSelfCheckinSettings.get(1)).toBe(true);
      expect(resultVisibilityService.setTrialSelfCheckin).toHaveBeenCalledWith(1, true);
    });

    it('should handle trial self check-in errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(resultVisibilityService.setTrialSelfCheckin).mockRejectedValue(new Error('Trial error'));

      const { result } = renderHook(() => useSelfCheckinSettings());

      let setResult;
      await act(async () => {
        setResult = await result.current.handleSetTrialSelfCheckin(2, false, 'Trial 2');
      });

      expect(setResult).toEqual({
        success: false,
        error: 'Trial error'
      });
      expect(result.current.trialSelfCheckinSettings.has(2)).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should set multiple trial overrides', async () => {
      vi.mocked(resultVisibilityService.setTrialSelfCheckin).mockResolvedValue();

      const { result } = renderHook(() => useSelfCheckinSettings());

      // Set trial 1 to enabled
      await act(async () => {
        await result.current.handleSetTrialSelfCheckin(1, true, 'Trial 1');
      });

      // Set trial 2 to disabled
      await act(async () => {
        await result.current.handleSetTrialSelfCheckin(2, false, 'Trial 2');
      });

      // Set trial 3 to enabled
      await act(async () => {
        await result.current.handleSetTrialSelfCheckin(3, true, 'Trial 3');
      });

      expect(result.current.trialSelfCheckinSettings.get(1)).toBe(true);
      expect(result.current.trialSelfCheckinSettings.get(2)).toBe(false);
      expect(result.current.trialSelfCheckinSettings.get(3)).toBe(true);
      expect(result.current.trialSelfCheckinSettings.size).toBe(3);
    });

    it('should update existing trial override', async () => {
      vi.mocked(resultVisibilityService.setTrialSelfCheckin).mockResolvedValue();

      const { result } = renderHook(() => useSelfCheckinSettings());

      // Set initial value to enabled
      await act(async () => {
        await result.current.handleSetTrialSelfCheckin(1, true, 'Trial 1');
      });
      expect(result.current.trialSelfCheckinSettings.get(1)).toBe(true);

      // Update to disabled
      await act(async () => {
        await result.current.handleSetTrialSelfCheckin(1, false, 'Trial 1');
      });
      expect(result.current.trialSelfCheckinSettings.get(1)).toBe(false);
      expect(result.current.trialSelfCheckinSettings.size).toBe(1); // Still only 1 entry
    });
  });

  describe('Remove trial self check-in override', () => {
    it('should remove trial override successfully', async () => {
      vi.mocked(resultVisibilityService.setTrialSelfCheckin).mockResolvedValue();
      vi.mocked(resultVisibilityService.removeTrialSelfCheckinOverride).mockResolvedValue();

      const { result } = renderHook(() => useSelfCheckinSettings());

      // First, set an override
      await act(async () => {
        await result.current.handleSetTrialSelfCheckin(1, false, 'Trial 1');
      });
      expect(result.current.trialSelfCheckinSettings.has(1)).toBe(true);

      // Then remove it
      let removeResult;
      await act(async () => {
        removeResult = await result.current.handleRemoveTrialSelfCheckin(1, 'Trial 1');
      });

      expect(removeResult).toEqual({ success: true });
      expect(result.current.trialSelfCheckinSettings.has(1)).toBe(false);
      expect(resultVisibilityService.removeTrialSelfCheckinOverride).toHaveBeenCalledWith(1);
    });

    it('should handle remove trial errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(resultVisibilityService.setTrialSelfCheckin).mockResolvedValue();
      vi.mocked(resultVisibilityService.removeTrialSelfCheckinOverride).mockRejectedValue(new Error('Remove error'));

      const { result } = renderHook(() => useSelfCheckinSettings());

      // Set an override first
      await act(async () => {
        await result.current.handleSetTrialSelfCheckin(1, false, 'Trial 1');
      });

      // Try to remove it (should fail)
      let removeResult;
      await act(async () => {
        removeResult = await result.current.handleRemoveTrialSelfCheckin(1, 'Trial 1');
      });

      expect(removeResult).toEqual({
        success: false,
        error: 'Remove error'
      });
      expect(result.current.trialSelfCheckinSettings.has(1)).toBe(true); // Should still have it
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle removing non-existent override gracefully', async () => {
      vi.mocked(resultVisibilityService.removeTrialSelfCheckinOverride).mockResolvedValue();

      const { result } = renderHook(() => useSelfCheckinSettings());

      // Try to remove override that doesn't exist
      let removeResult;
      await act(async () => {
        removeResult = await result.current.handleRemoveTrialSelfCheckin(999, 'Trial 999');
      });

      expect(removeResult).toEqual({ success: true });
      expect(result.current.trialSelfCheckinSettings.has(999)).toBe(false);
    });

    it('should remove one trial without affecting others', async () => {
      vi.mocked(resultVisibilityService.setTrialSelfCheckin).mockResolvedValue();
      vi.mocked(resultVisibilityService.removeTrialSelfCheckinOverride).mockResolvedValue();

      const { result } = renderHook(() => useSelfCheckinSettings());

      // Set multiple trials
      await act(async () => {
        await result.current.handleSetTrialSelfCheckin(1, true, 'Trial 1');
        await result.current.handleSetTrialSelfCheckin(2, false, 'Trial 2');
        await result.current.handleSetTrialSelfCheckin(3, true, 'Trial 3');
      });

      expect(result.current.trialSelfCheckinSettings.size).toBe(3);

      // Remove trial 2
      await act(async () => {
        await result.current.handleRemoveTrialSelfCheckin(2, 'Trial 2');
      });

      expect(result.current.trialSelfCheckinSettings.has(1)).toBe(true);
      expect(result.current.trialSelfCheckinSettings.has(2)).toBe(false); // Removed
      expect(result.current.trialSelfCheckinSettings.has(3)).toBe(true);
      expect(result.current.trialSelfCheckinSettings.size).toBe(2);
    });
  });

  describe('State management', () => {
    it('should allow direct state updates via setters', () => {
      const { result } = renderHook(() => useSelfCheckinSettings());

      act(() => {
        result.current.setShowSelfCheckinEnabled(false);
      });
      expect(result.current.showSelfCheckinEnabled).toBe(false);

      act(() => {
        const newMap = new Map([[1, true], [2, false]]);
        result.current.setTrialSelfCheckinSettings(newMap);
      });
      expect(result.current.trialSelfCheckinSettings.size).toBe(2);

      act(() => {
        result.current.setCheckinSectionExpanded(true);
      });
      expect(result.current.checkinSectionExpanded).toBe(true);
    });

    it('should maintain state independence between renders', async () => {
      vi.mocked(resultVisibilityService.setShowSelfCheckin).mockResolvedValue();
      vi.mocked(resultVisibilityService.setTrialSelfCheckin).mockResolvedValue();

      const { result } = renderHook(() => useSelfCheckinSettings());

      // Set show and trial settings
      await act(async () => {
        await result.current.handleSetShowSelfCheckin(false, 'license-123');
        await result.current.handleSetTrialSelfCheckin(1, true, 'Trial 1');
      });

      // Both should be set independently
      expect(result.current.showSelfCheckinEnabled).toBe(false);
      expect(result.current.trialSelfCheckinSettings.get(1)).toBe(true);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle complete self check-in management workflow', async () => {
      vi.mocked(resultVisibilityService.setShowSelfCheckin).mockResolvedValue();
      vi.mocked(resultVisibilityService.setTrialSelfCheckin).mockResolvedValue();
      vi.mocked(resultVisibilityService.removeTrialSelfCheckinOverride).mockResolvedValue();

      const { result } = renderHook(() => useSelfCheckinSettings());

      // 1. Set show default to enabled (already default)
      await act(async () => {
        const result1 = await result.current.handleSetShowSelfCheckin(true, 'license-123');
        expect(result1.success).toBe(true);
      });

      // 2. Override trial 1 to disabled
      await act(async () => {
        const result2 = await result.current.handleSetTrialSelfCheckin(1, false, 'Trial 1');
        expect(result2.success).toBe(true);
      });

      // 3. Override trial 2 to enabled
      await act(async () => {
        const result3 = await result.current.handleSetTrialSelfCheckin(2, true, 'Trial 2');
        expect(result3.success).toBe(true);
      });

      // 4. Change show default to disabled
      await act(async () => {
        const result4 = await result.current.handleSetShowSelfCheckin(false, 'license-123');
        expect(result4.success).toBe(true);
      });

      // 5. Remove trial 1 override (should fall back to show default)
      await act(async () => {
        const result5 = await result.current.handleRemoveTrialSelfCheckin(1, 'Trial 1');
        expect(result5.success).toBe(true);
      });

      // Final state
      expect(result.current.showSelfCheckinEnabled).toBe(false);
      expect(result.current.trialSelfCheckinSettings.has(1)).toBe(false); // Removed
      expect(result.current.trialSelfCheckinSettings.get(2)).toBe(true); // Still has override
    });

    it('should handle error recovery gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // First call fails, second succeeds
      vi.mocked(resultVisibilityService.setShowSelfCheckin)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce();

      const { result } = renderHook(() => useSelfCheckinSettings());

      // First attempt fails
      let result1;
      await act(async () => {
        result1 = await result.current.handleSetShowSelfCheckin(false, 'license-123');
      });
      expect(result1!.success).toBe(false);
      expect(result.current.showSelfCheckinEnabled).toBe(true);

      // Retry succeeds
      let result2;
      await act(async () => {
        result2 = await result.current.handleSetShowSelfCheckin(false, 'license-123');
      });
      expect(result2!.success).toBe(true);
      expect(result.current.showSelfCheckinEnabled).toBe(false);

      consoleErrorSpy.mockRestore();
    });

    it('should handle cascade override logic correctly', async () => {
      vi.mocked(resultVisibilityService.setShowSelfCheckin).mockResolvedValue();
      vi.mocked(resultVisibilityService.setTrialSelfCheckin).mockResolvedValue();

      const { result } = renderHook(() => useSelfCheckinSettings());

      // Show default: enabled
      await act(async () => {
        await result.current.handleSetShowSelfCheckin(true, 'license-123');
      });

      // Trial 1: override to disabled
      await act(async () => {
        await result.current.handleSetTrialSelfCheckin(1, false, 'Trial 1');
      });

      // Trial 2: override to disabled
      await act(async () => {
        await result.current.handleSetTrialSelfCheckin(2, false, 'Trial 2');
      });

      // Verify cascade: show is enabled, but trials are disabled
      expect(result.current.showSelfCheckinEnabled).toBe(true);
      expect(result.current.trialSelfCheckinSettings.get(1)).toBe(false);
      expect(result.current.trialSelfCheckinSettings.get(2)).toBe(false);
    });
  });
});
