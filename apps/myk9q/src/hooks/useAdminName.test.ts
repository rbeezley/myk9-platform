/**
 * Unit Tests for useAdminName Hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useAdminName } from './useAdminName';
import {
  safeLocalStorageGet,
  safeLocalStorageSet,
  safeLocalStorageRemove,
} from '../utils/localStorageUtils';
import { vi } from 'vitest';

// Mock localStorageUtils
vi.mock('../utils/localStorageUtils', () => ({
  safeLocalStorageGet: vi.fn(),
  safeLocalStorageSet: vi.fn(),
  safeLocalStorageRemove: vi.fn(),
}));

describe('useAdminName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: return empty string from localStorage
    vi.mocked(safeLocalStorageGet).mockReturnValue('');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial state', () => {
    test('should initialize with empty name by default', () => {
      const { result } = renderHook(() => useAdminName());

      expect(result.current.adminName).toBe('');
      expect(result.current.hasAdminName).toBe(false);
    });

    test('should load admin name from localStorage on mount', () => {
      vi.mocked(safeLocalStorageGet).mockReturnValue('John Smith');

      const { result } = renderHook(() => useAdminName());

      expect(safeLocalStorageGet).toHaveBeenCalledWith('myk9q_admin_name', '');
      expect(result.current.adminName).toBe('John Smith');
      expect(result.current.hasAdminName).toBe(true);
    });

    test('should use default name if provided and not in localStorage', () => {
      vi.mocked(safeLocalStorageGet).mockReturnValue('');

      const { result } = renderHook(() =>
        useAdminName({ defaultName: 'Default Admin' })
      );

      expect(safeLocalStorageGet).toHaveBeenCalledWith('myk9q_admin_name', 'Default Admin');
      expect(result.current.adminName).toBe('');
    });

    test('should prefer localStorage value over default', () => {
      vi.mocked(safeLocalStorageGet).mockReturnValue('Saved Admin');

      const { result } = renderHook(() =>
        useAdminName({ defaultName: 'Default Admin' })
      );

      expect(result.current.adminName).toBe('Saved Admin');
    });
  });

  describe('setAdminName', () => {
    test('should update admin name', () => {
      const { result } = renderHook(() => useAdminName());

      act(() => {
        result.current.setAdminName('Jane Doe');
      });

      expect(result.current.adminName).toBe('Jane Doe');
      expect(result.current.hasAdminName).toBe(true);
    });

    test('should trim and save to localStorage', async () => {
      const { result } = renderHook(() => useAdminName());

      act(() => {
        result.current.setAdminName('  John Smith  ');
      });

      await waitFor(() => {
        expect(safeLocalStorageSet).toHaveBeenCalledWith('myk9q_admin_name', 'John Smith');
      });
    });

    test('should handle name with leading/trailing spaces', async () => {
      const { result } = renderHook(() => useAdminName());

      act(() => {
        result.current.setAdminName('   Admin Name   ');
      });

      await waitFor(() => {
        expect(safeLocalStorageSet).toHaveBeenCalledWith('myk9q_admin_name', 'Admin Name');
      });
    });

    test('should update multiple times', async () => {
      const { result } = renderHook(() => useAdminName());

      act(() => {
        result.current.setAdminName('First Name');
      });

      await waitFor(() => {
        expect(safeLocalStorageSet).toHaveBeenCalledWith('myk9q_admin_name', 'First Name');
      });

      vi.mocked(safeLocalStorageSet).mockClear();

      act(() => {
        result.current.setAdminName('Second Name');
      });

      await waitFor(() => {
        expect(safeLocalStorageSet).toHaveBeenCalledWith('myk9q_admin_name', 'Second Name');
      });
    });

    test('should remove from localStorage if empty after trimming', async () => {
      const { result } = renderHook(() => useAdminName());

      act(() => {
        result.current.setAdminName('   ');
      });

      await waitFor(() => {
        expect(safeLocalStorageRemove).toHaveBeenCalledWith('myk9q_admin_name');
      });
    });
  });

  describe('clearAdminName', () => {
    test('should clear admin name', () => {
      vi.mocked(safeLocalStorageGet).mockReturnValue('John Smith');
      const { result } = renderHook(() => useAdminName());

      expect(result.current.adminName).toBe('John Smith');

      act(() => {
        result.current.clearAdminName();
      });

      expect(result.current.adminName).toBe('');
      expect(result.current.hasAdminName).toBe(false);
    });

    test('should remove from localStorage', () => {
      vi.mocked(safeLocalStorageGet).mockReturnValue('John Smith');
      const { result } = renderHook(() => useAdminName());

      act(() => {
        result.current.clearAdminName();
      });

      expect(safeLocalStorageRemove).toHaveBeenCalledWith('myk9q_admin_name');
    });

    test('should work when already empty', () => {
      const { result } = renderHook(() => useAdminName());

      act(() => {
        result.current.clearAdminName();
      });

      expect(result.current.adminName).toBe('');
      expect(safeLocalStorageRemove).toHaveBeenCalledWith('myk9q_admin_name');
    });
  });

  describe('hasAdminName', () => {
    test('should return true when name is set', () => {
      vi.mocked(safeLocalStorageGet).mockReturnValue('John Smith');
      const { result } = renderHook(() => useAdminName());

      expect(result.current.hasAdminName).toBe(true);
    });

    test('should return false when name is empty', () => {
      const { result } = renderHook(() => useAdminName());

      expect(result.current.hasAdminName).toBe(false);
    });

    test('should return false when name is only whitespace', () => {
      const { result } = renderHook(() => useAdminName());

      act(() => {
        result.current.setAdminName('   ');
      });

      expect(result.current.hasAdminName).toBe(false);
    });

    test('should update when name changes', () => {
      const { result } = renderHook(() => useAdminName());

      expect(result.current.hasAdminName).toBe(false);

      act(() => {
        result.current.setAdminName('Admin');
      });

      expect(result.current.hasAdminName).toBe(true);

      act(() => {
        result.current.clearAdminName();
      });

      expect(result.current.hasAdminName).toBe(false);
    });
  });

  describe('onNameChange callback', () => {
    test('should call callback when name changes', async () => {
      const onNameChange = vi.fn();
      const { result } = renderHook(() =>
        useAdminName({ onNameChange })
      );

      act(() => {
        result.current.setAdminName('  John Smith  ');
      });

      await waitFor(() => {
        expect(onNameChange).toHaveBeenCalledWith('John Smith');
      });
    });

    test('should call callback with trimmed name', async () => {
      const onNameChange = vi.fn();
      const { result } = renderHook(() =>
        useAdminName({ onNameChange })
      );

      act(() => {
        result.current.setAdminName('   Admin   ');
      });

      await waitFor(() => {
        expect(onNameChange).toHaveBeenCalledWith('Admin');
      });
    });

    test('should call callback when clearing', () => {
      const onNameChange = vi.fn();
      vi.mocked(safeLocalStorageGet).mockReturnValue('John Smith');

      const { result } = renderHook(() =>
        useAdminName({ onNameChange })
      );

      onNameChange.mockClear();

      act(() => {
        result.current.clearAdminName();
      });

      expect(onNameChange).toHaveBeenCalledWith('');
    });

    test('should call callback on initialization with loaded name', async () => {
      const onNameChange = vi.fn();
      vi.mocked(safeLocalStorageGet).mockReturnValue('John Smith');

      renderHook(() => useAdminName({ onNameChange }));

      // The useEffect fires after mount, so callback is called with loaded name
      await waitFor(() => {
        expect(onNameChange).toHaveBeenCalledWith('John Smith');
      });
    });
  });

  describe('Real-world CompetitionAdmin.tsx workflow', () => {
    test('should handle admin name prompt workflow', async () => {
      const { result } = renderHook(() => useAdminName());

      // User hasn't set name yet
      expect(result.current.hasAdminName).toBe(false);

      // User enters name in dialog
      act(() => {
        result.current.setAdminName('Event Organizer');
      });

      // Name is saved and available
      expect(result.current.adminName).toBe('Event Organizer');
      expect(result.current.hasAdminName).toBe(true);

      await waitFor(() => {
        expect(safeLocalStorageSet).toHaveBeenCalledWith('myk9q_admin_name', 'Event Organizer');
      });
    });

    test('should persist across sessions', () => {
      // First session: save name
      vi.mocked(safeLocalStorageGet).mockReturnValue('');
      const { result: result1 } = renderHook(() => useAdminName());

      act(() => {
        result1.current.setAdminName('Admin User');
      });

      // Simulate new session: localStorage returns saved name
      vi.mocked(safeLocalStorageGet).mockReturnValue('Admin User');
      const { result: result2 } = renderHook(() => useAdminName());

      expect(result2.current.adminName).toBe('Admin User');
      expect(result2.current.hasAdminName).toBe(true);
    });

    test('should handle name update workflow', async () => {
      vi.mocked(safeLocalStorageGet).mockReturnValue('Old Name');
      const { result } = renderHook(() => useAdminName());

      expect(result.current.adminName).toBe('Old Name');

      // User updates their name
      act(() => {
        result.current.setAdminName('New Name');
      });

      expect(result.current.adminName).toBe('New Name');

      await waitFor(() => {
        expect(safeLocalStorageSet).toHaveBeenCalledWith('myk9q_admin_name', 'New Name');
      });
    });
  });

  describe('Edge cases', () => {
    test('should handle very long names', async () => {
      const longName = 'A'.repeat(1000);
      const { result } = renderHook(() => useAdminName());

      act(() => {
        result.current.setAdminName(longName);
      });

      expect(result.current.adminName).toBe(longName);

      await waitFor(() => {
        expect(safeLocalStorageSet).toHaveBeenCalledWith('myk9q_admin_name', longName);
      });
    });

    test('should handle names with special characters', async () => {
      const specialName = "John O'Brien-Smith";
      const { result } = renderHook(() => useAdminName());

      act(() => {
        result.current.setAdminName(specialName);
      });

      expect(result.current.adminName).toBe(specialName);

      await waitFor(() => {
        expect(safeLocalStorageSet).toHaveBeenCalledWith('myk9q_admin_name', specialName);
      });
    });

    test('should handle names with unicode characters', async () => {
      const unicodeName = '王明 🎯';
      const { result } = renderHook(() => useAdminName());

      act(() => {
        result.current.setAdminName(unicodeName);
      });

      expect(result.current.adminName).toBe(unicodeName);

      await waitFor(() => {
        expect(safeLocalStorageSet).toHaveBeenCalledWith('myk9q_admin_name', unicodeName);
      });
    });

    test('should handle empty string', async () => {
      const { result } = renderHook(() => useAdminName());

      act(() => {
        result.current.setAdminName('');
      });

      expect(result.current.adminName).toBe('');
      expect(result.current.hasAdminName).toBe(false);

      await waitFor(() => {
        expect(safeLocalStorageRemove).toHaveBeenCalledWith('myk9q_admin_name');
      });
    });

    test('should handle rapid changes', async () => {
      const { result } = renderHook(() => useAdminName());

      act(() => {
        result.current.setAdminName('Name 1');
        result.current.setAdminName('Name 2');
        result.current.setAdminName('Name 3');
      });

      expect(result.current.adminName).toBe('Name 3');

      await waitFor(() => {
        expect(safeLocalStorageSet).toHaveBeenLastCalledWith('myk9q_admin_name', 'Name 3');
      });
    });
  });

  describe('localStorage integration', () => {
    test('should use safeLocalStorageGet on mount', () => {
      renderHook(() => useAdminName());

      expect(safeLocalStorageGet).toHaveBeenCalledWith('myk9q_admin_name', '');
    });

    test('should use safeLocalStorageSet when setting name', async () => {
      const { result } = renderHook(() => useAdminName());

      act(() => {
        result.current.setAdminName('Test Admin');
      });

      await waitFor(() => {
        expect(safeLocalStorageSet).toHaveBeenCalledWith('myk9q_admin_name', 'Test Admin');
      });
    });

    test('should use safeLocalStorageRemove when clearing', () => {
      vi.mocked(safeLocalStorageGet).mockReturnValue('Test');
      const { result } = renderHook(() => useAdminName());

      act(() => {
        result.current.clearAdminName();
      });

      expect(safeLocalStorageRemove).toHaveBeenCalledWith('myk9q_admin_name');
    });
  });
});
