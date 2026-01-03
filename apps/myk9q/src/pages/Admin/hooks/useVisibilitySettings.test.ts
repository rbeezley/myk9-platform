/**
 * Tests for useVisibilitySettings Hook
 */

import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useVisibilitySettings } from './useVisibilitySettings';
import * as resultVisibilityService from '@/services/resultVisibilityService';

// Mock the result visibility service
vi.mock('@/services/resultVisibilityService');

describe('useVisibilitySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useVisibilitySettings());

      expect(result.current.showVisibilityPreset).toBe('standard');
      expect(result.current.trialVisibilitySettings).toEqual(new Map());
      expect(result.current.visibilitySectionExpanded).toBe(false);
    });

    it('should provide all required methods', () => {
      const { result } = renderHook(() => useVisibilitySettings());

      expect(typeof result.current.setShowVisibilityPreset).toBe('function');
      expect(typeof result.current.setTrialVisibilitySettings).toBe('function');
      expect(typeof result.current.setVisibilitySectionExpanded).toBe('function');
      expect(typeof result.current.handleSetShowVisibility).toBe('function');
      expect(typeof result.current.handleSetTrialVisibility).toBe('function');
      expect(typeof result.current.handleRemoveTrialVisibility).toBe('function');
    });
  });

  describe('Show-level visibility', () => {
    it('should set show visibility successfully', async () => {
      vi.mocked(resultVisibilityService.setShowVisibility).mockResolvedValue();

      const { result } = renderHook(() => useVisibilitySettings());

      let setResult;
      await act(async () => {
        setResult = await result.current.handleSetShowVisibility('open', 'John Doe', 'license-123');
      });

      expect(setResult).toEqual({ success: true });
      expect(result.current.showVisibilityPreset).toBe('open');
      expect(resultVisibilityService.setShowVisibility).toHaveBeenCalledWith('license-123', 'open', 'John Doe');
    });

    it('should handle show visibility errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(resultVisibilityService.setShowVisibility).mockRejectedValue(new Error('Service error'));

      const { result } = renderHook(() => useVisibilitySettings());

      let setResult;
      await act(async () => {
        setResult = await result.current.handleSetShowVisibility('review', 'Jane Smith', 'license-456');
      });

      expect(setResult).toEqual({
        success: false,
        error: 'Service error'
      });
      expect(result.current.showVisibilityPreset).toBe('standard'); // Should remain unchanged
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should update to different presets', async () => {
      vi.mocked(resultVisibilityService.setShowVisibility).mockResolvedValue();

      const { result } = renderHook(() => useVisibilitySettings());

      // Set to 'open'
      await act(async () => {
        await result.current.handleSetShowVisibility('open', 'Admin', 'license-123');
      });
      expect(result.current.showVisibilityPreset).toBe('open');

      // Change to 'review'
      await act(async () => {
        await result.current.handleSetShowVisibility('review', 'Admin', 'license-123');
      });
      expect(result.current.showVisibilityPreset).toBe('review');

      // Change to 'standard'
      await act(async () => {
        await result.current.handleSetShowVisibility('standard', 'Admin', 'license-123');
      });
      expect(result.current.showVisibilityPreset).toBe('standard');
    });
  });

  describe('Trial-level visibility', () => {
    it('should set trial visibility override successfully', async () => {
      vi.mocked(resultVisibilityService.setTrialVisibility).mockResolvedValue();

      const { result } = renderHook(() => useVisibilitySettings());

      let setResult;
      await act(async () => {
        setResult = await result.current.handleSetTrialVisibility(1, 'review', 'Admin', 'Trial 1');
      });

      expect(setResult).toEqual({ success: true });
      expect(result.current.trialVisibilitySettings.get(1)).toBe('review');
      expect(resultVisibilityService.setTrialVisibility).toHaveBeenCalledWith(1, 'review', 'Admin');
    });

    it('should handle trial visibility errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(resultVisibilityService.setTrialVisibility).mockRejectedValue(new Error('Trial error'));

      const { result } = renderHook(() => useVisibilitySettings());

      let setResult;
      await act(async () => {
        setResult = await result.current.handleSetTrialVisibility(2, 'open', 'Admin', 'Trial 2');
      });

      expect(setResult).toEqual({
        success: false,
        error: 'Trial error'
      });
      expect(result.current.trialVisibilitySettings.has(2)).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should set multiple trial overrides', async () => {
      vi.mocked(resultVisibilityService.setTrialVisibility).mockResolvedValue();

      const { result } = renderHook(() => useVisibilitySettings());

      // Set trial 1
      await act(async () => {
        await result.current.handleSetTrialVisibility(1, 'open', 'Admin', 'Trial 1');
      });

      // Set trial 2
      await act(async () => {
        await result.current.handleSetTrialVisibility(2, 'review', 'Admin', 'Trial 2');
      });

      // Set trial 3
      await act(async () => {
        await result.current.handleSetTrialVisibility(3, 'standard', 'Admin', 'Trial 3');
      });

      expect(result.current.trialVisibilitySettings.get(1)).toBe('open');
      expect(result.current.trialVisibilitySettings.get(2)).toBe('review');
      expect(result.current.trialVisibilitySettings.get(3)).toBe('standard');
      expect(result.current.trialVisibilitySettings.size).toBe(3);
    });

    it('should update existing trial override', async () => {
      vi.mocked(resultVisibilityService.setTrialVisibility).mockResolvedValue();

      const { result } = renderHook(() => useVisibilitySettings());

      // Set initial value
      await act(async () => {
        await result.current.handleSetTrialVisibility(1, 'open', 'Admin', 'Trial 1');
      });
      expect(result.current.trialVisibilitySettings.get(1)).toBe('open');

      // Update to different value
      await act(async () => {
        await result.current.handleSetTrialVisibility(1, 'review', 'Admin', 'Trial 1');
      });
      expect(result.current.trialVisibilitySettings.get(1)).toBe('review');
      expect(result.current.trialVisibilitySettings.size).toBe(1); // Still only 1 entry
    });
  });

  describe('Remove trial visibility override', () => {
    it('should remove trial override successfully', async () => {
      vi.mocked(resultVisibilityService.setTrialVisibility).mockResolvedValue();
      vi.mocked(resultVisibilityService.removeTrialVisibilityOverride).mockResolvedValue();

      const { result } = renderHook(() => useVisibilitySettings());

      // First, set an override
      await act(async () => {
        await result.current.handleSetTrialVisibility(1, 'review', 'Admin', 'Trial 1');
      });
      expect(result.current.trialVisibilitySettings.has(1)).toBe(true);

      // Then remove it
      let removeResult;
      await act(async () => {
        removeResult = await result.current.handleRemoveTrialVisibility(1, 'Trial 1');
      });

      expect(removeResult).toEqual({ success: true });
      expect(result.current.trialVisibilitySettings.has(1)).toBe(false);
      expect(resultVisibilityService.removeTrialVisibilityOverride).toHaveBeenCalledWith(1);
    });

    it('should handle remove trial errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(resultVisibilityService.setTrialVisibility).mockResolvedValue();
      vi.mocked(resultVisibilityService.removeTrialVisibilityOverride).mockRejectedValue(new Error('Remove error'));

      const { result } = renderHook(() => useVisibilitySettings());

      // Set an override first
      await act(async () => {
        await result.current.handleSetTrialVisibility(1, 'review', 'Admin', 'Trial 1');
      });

      // Try to remove it (should fail)
      let removeResult;
      await act(async () => {
        removeResult = await result.current.handleRemoveTrialVisibility(1, 'Trial 1');
      });

      expect(removeResult).toEqual({
        success: false,
        error: 'Remove error'
      });
      expect(result.current.trialVisibilitySettings.has(1)).toBe(true); // Should still have it
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle removing non-existent override gracefully', async () => {
      vi.mocked(resultVisibilityService.removeTrialVisibilityOverride).mockResolvedValue();

      const { result } = renderHook(() => useVisibilitySettings());

      // Try to remove override that doesn't exist
      let removeResult;
      await act(async () => {
        removeResult = await result.current.handleRemoveTrialVisibility(999, 'Trial 999');
      });

      expect(removeResult).toEqual({ success: true });
      expect(result.current.trialVisibilitySettings.has(999)).toBe(false);
    });

    it('should remove one trial without affecting others', async () => {
      vi.mocked(resultVisibilityService.setTrialVisibility).mockResolvedValue();
      vi.mocked(resultVisibilityService.removeTrialVisibilityOverride).mockResolvedValue();

      const { result } = renderHook(() => useVisibilitySettings());

      // Set multiple trials
      await act(async () => {
        await result.current.handleSetTrialVisibility(1, 'open', 'Admin', 'Trial 1');
        await result.current.handleSetTrialVisibility(2, 'review', 'Admin', 'Trial 2');
        await result.current.handleSetTrialVisibility(3, 'standard', 'Admin', 'Trial 3');
      });

      expect(result.current.trialVisibilitySettings.size).toBe(3);

      // Remove trial 2
      await act(async () => {
        await result.current.handleRemoveTrialVisibility(2, 'Trial 2');
      });

      expect(result.current.trialVisibilitySettings.has(1)).toBe(true);
      expect(result.current.trialVisibilitySettings.has(2)).toBe(false); // Removed
      expect(result.current.trialVisibilitySettings.has(3)).toBe(true);
      expect(result.current.trialVisibilitySettings.size).toBe(2);
    });
  });

  describe('State management', () => {
    it('should allow direct state updates via setters', () => {
      const { result } = renderHook(() => useVisibilitySettings());

      act(() => {
        result.current.setShowVisibilityPreset('review');
      });
      expect(result.current.showVisibilityPreset).toBe('review');

      act(() => {
        const newMap = new Map([[1, 'open' as const], [2, 'standard' as const]]);
        result.current.setTrialVisibilitySettings(newMap);
      });
      expect(result.current.trialVisibilitySettings.size).toBe(2);

      act(() => {
        result.current.setVisibilitySectionExpanded(true);
      });
      expect(result.current.visibilitySectionExpanded).toBe(true);
    });

    it('should maintain state independence between renders', async () => {
      vi.mocked(resultVisibilityService.setShowVisibility).mockResolvedValue();
      vi.mocked(resultVisibilityService.setTrialVisibility).mockResolvedValue();

      const { result } = renderHook(() => useVisibilitySettings());

      // Set show and trial settings
      await act(async () => {
        await result.current.handleSetShowVisibility('review', 'Admin', 'license-123');
        await result.current.handleSetTrialVisibility(1, 'open', 'Admin', 'Trial 1');
      });

      // Both should be set independently
      expect(result.current.showVisibilityPreset).toBe('review');
      expect(result.current.trialVisibilitySettings.get(1)).toBe('open');
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle complete visibility management workflow', async () => {
      vi.mocked(resultVisibilityService.setShowVisibility).mockResolvedValue();
      vi.mocked(resultVisibilityService.setTrialVisibility).mockResolvedValue();
      vi.mocked(resultVisibilityService.removeTrialVisibilityOverride).mockResolvedValue();

      const { result } = renderHook(() => useVisibilitySettings());

      // 1. Set show default to 'standard'
      await act(async () => {
        const result1 = await result.current.handleSetShowVisibility('standard', 'Admin', 'license-123');
        expect(result1.success).toBe(true);
      });

      // 2. Override trial 1 to 'review'
      await act(async () => {
        const result2 = await result.current.handleSetTrialVisibility(1, 'review', 'Admin', 'Trial 1');
        expect(result2.success).toBe(true);
      });

      // 3. Override trial 2 to 'open'
      await act(async () => {
        const result3 = await result.current.handleSetTrialVisibility(2, 'open', 'Admin', 'Trial 2');
        expect(result3.success).toBe(true);
      });

      // 4. Change show default to 'open'
      await act(async () => {
        const result4 = await result.current.handleSetShowVisibility('open', 'Admin', 'license-123');
        expect(result4.success).toBe(true);
      });

      // 5. Remove trial 1 override (should fall back to show default)
      await act(async () => {
        const result5 = await result.current.handleRemoveTrialVisibility(1, 'Trial 1');
        expect(result5.success).toBe(true);
      });

      // Final state
      expect(result.current.showVisibilityPreset).toBe('open');
      expect(result.current.trialVisibilitySettings.has(1)).toBe(false); // Removed
      expect(result.current.trialVisibilitySettings.get(2)).toBe('open'); // Still has override
    });

    it('should handle error recovery gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // First call fails, second succeeds
      vi.mocked(resultVisibilityService.setShowVisibility)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce();

      const { result } = renderHook(() => useVisibilitySettings());

      // First attempt fails
      let result1;
      await act(async () => {
        result1 = await result.current.handleSetShowVisibility('review', 'Admin', 'license-123');
      });
      expect(result1!.success).toBe(false);
      expect(result.current.showVisibilityPreset).toBe('standard');

      // Retry succeeds
      let result2;
      await act(async () => {
        result2 = await result.current.handleSetShowVisibility('review', 'Admin', 'license-123');
      });
      expect(result2!.success).toBe(true);
      expect(result.current.showVisibilityPreset).toBe('review');

      consoleErrorSpy.mockRestore();
    });
  });
});
