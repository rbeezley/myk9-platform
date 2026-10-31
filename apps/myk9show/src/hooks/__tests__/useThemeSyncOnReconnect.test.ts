import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { DEFAULT_THEME_PREFERENCES } from '@/types/user-preferences';
import { buildDefaults } from '@/services/preferences/userPreferencesService';
import { recordLocalThemeChange, readDeviceTheme } from '@/services/preferences/deviceThemeCache';

let mockOnline = true;
let mockUserId: string | null = 'u1';
const mockApply = vi.fn();
vi.mock('@/lib/networkUtils', () => ({ useOnlineStatus: () => mockOnline }));
vi.mock('@/hooks/useAuthUser', () => ({
  useAuthUser: () => (mockUserId ? { id: mockUserId } : null),
}));
vi.mock('@/hooks/useApplyServerTheme', () => ({ useApplyServerTheme: () => mockApply }));
vi.mock('@/utils/standardizedErrorHandler', () => ({
  reportInfo: vi.fn(),
  reportStoreError: vi.fn(),
}));

const mockLoad = vi.fn();
const mockUpdate = vi.fn();
vi.mock('@/services/preferences/userPreferencesService', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/preferences/userPreferencesService')>()),
  userPreferencesService: {
    loadPreferences: (...a: unknown[]) => mockLoad(...a),
    updatePreferences: (...a: unknown[]) => mockUpdate(...a),
  },
}));

import { useThemeSyncOnReconnect } from '../useThemeSyncOnReconnect';

function serverRow(theme: Partial<typeof DEFAULT_THEME_PREFERENCES>, updatedAtMs: number) {
  return {
    ...buildDefaults('u1'),
    theme: { ...DEFAULT_THEME_PREFERENCES, ...theme },
    updatedAt: new Date(updatedAtMs),
  };
}

describe('useThemeSyncOnReconnect (app-level trigger)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockOnline = true;
    mockUserId = 'u1';
    mockLoad.mockReset();
    mockUpdate.mockReset();
    mockApply.mockReset();
  });

  it('pushes a pending offline change on reconnect with no Account page mounted', async () => {
    recordLocalThemeChange('u1', { mode: 'dark' }, 5000);
    mockOnline = false;
    const { rerender } = renderHook(() => useThemeSyncOnReconnect());
    expect(mockLoad).not.toHaveBeenCalled();

    mockOnline = true;
    mockLoad.mockResolvedValue(serverRow({ mode: 'light' }, 4000));
    mockUpdate.mockResolvedValue(serverRow({ mode: 'dark' }, 9000));
    rerender();
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('u1', { theme: { mode: 'dark' } }, { mode: 5000 })
    );
    await waitFor(() => expect(readDeviceTheme('u1')?.pending).toEqual([]));
  });

  it('applies a newer server value through the shared apply callback', async () => {
    recordLocalThemeChange('u1', { mode: 'dark' }, 5000);
    mockOnline = false;
    const { rerender } = renderHook(() => useThemeSyncOnReconnect());
    mockOnline = true;
    mockLoad.mockResolvedValue(serverRow({ mode: 'system' }, 6000));
    rerender();
    await waitFor(() =>
      expect(mockApply).toHaveBeenCalledWith(expect.objectContaining({ mode: 'system' }))
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does nothing on reconnect when nothing is pending', () => {
    mockOnline = false;
    const { rerender } = renderHook(() => useThemeSyncOnReconnect());
    mockOnline = true;
    rerender();
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('does nothing without a signed-in user', () => {
    mockUserId = null;
    recordLocalThemeChange('u1', { mode: 'dark' }, 5000);
    mockOnline = false;
    const { rerender } = renderHook(() => useThemeSyncOnReconnect());
    mockOnline = true;
    rerender();
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('drops the result when the user changed mid-sync', async () => {
    recordLocalThemeChange('u1', { mode: 'dark' }, 5000);
    mockOnline = false;
    const { rerender } = renderHook(() => useThemeSyncOnReconnect());
    mockOnline = true;
    let release: (v: unknown) => void = () => {};
    mockLoad.mockReturnValue(new Promise(r => (release = r)));
    rerender();
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    mockUserId = 'u2';
    rerender();
    release(serverRow({ mode: 'system' }, 6000));
    await new Promise(r => setTimeout(r, 20));
    expect(mockApply).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
