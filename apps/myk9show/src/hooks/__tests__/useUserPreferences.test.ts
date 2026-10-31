import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { DEFAULT_THEME_PREFERENCES } from '@/types/user-preferences';
import { buildDefaults } from '@/services/preferences/userPreferencesService';
import { recordLocalThemeChange, readDeviceTheme } from '@/services/preferences/deviceThemeCache';

let mockOnline = true;
vi.mock('@/lib/networkUtils', () => ({ useOnlineStatus: () => mockOnline }));
vi.mock('@/utils/standardizedErrorHandler', () => ({
  reportInfo: vi.fn(),
  reportStoreError: vi.fn(),
}));

const mockLoad = vi.fn();
const mockUpdate = vi.fn();
const mockReset = vi.fn();
vi.mock('@/services/preferences/userPreferencesService', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/preferences/userPreferencesService')>()),
  userPreferencesService: {
    loadPreferences: (...a: unknown[]) => mockLoad(...a),
    updatePreferences: (...a: unknown[]) => mockUpdate(...a),
    resetToDefaults: (...a: unknown[]) => mockReset(...a),
  },
}));

import { useUserPreferences, NEEDS_CONNECTION_MESSAGE } from '../useUserPreferences';

function serverRow(theme: Partial<typeof DEFAULT_THEME_PREFERENCES>, updatedAtMs: number) {
  return {
    ...buildDefaults('u1'),
    theme: { ...DEFAULT_THEME_PREFERENCES, ...theme },
    updatedAt: new Date(updatedAtMs),
  };
}

describe('useUserPreferences (local-first)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockOnline = true;
    mockLoad.mockReset();
    mockUpdate.mockReset();
    mockReset.mockReset();
  });

  it('offline cold boot shows the device copy and never asks the server to succeed', async () => {
    recordLocalThemeChange('u1', { mode: 'dark' }, 5000);
    mockOnline = false;
    mockLoad.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useUserPreferences('u1'));
    expect(result.current.preferences?.theme.mode).toBe('dark');
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.preferences?.theme.mode).toBe('dark');
  });

  it('offline with nothing saved falls back to defaults instead of an empty page', async () => {
    mockOnline = false;
    mockLoad.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useUserPreferences('u1'));
    await waitFor(() =>
      expect(result.current.preferences?.theme).toEqual(DEFAULT_THEME_PREFERENCES)
    );
  });

  it('offline theme change applies at once, persists, and does not throw or call the server', async () => {
    mockOnline = false;
    mockLoad.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useUserPreferences('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.updatePreferences({ theme: { colorScheme: 'grove' } }));
    expect(result.current.preferences?.theme.colorScheme).toBe('grove');
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(readDeviceTheme('u1')?.pending).toEqual(['colorScheme']);
  });

  it('offline server-only change says it needs a connection', async () => {
    mockOnline = false;
    mockLoad.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useUserPreferences('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(
      act(() => result.current.updatePreferences({ privacy: { sharePresence: false } }))
    ).rejects.toThrow(NEEDS_CONNECTION_MESSAGE);
    await expect(act(() => result.current.resetToDefaults())).rejects.toThrow(
      NEEDS_CONNECTION_MESSAGE
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('coming back online pushes a pending change newer than the server value', async () => {
    recordLocalThemeChange('u1', { mode: 'dark' }, 5000);
    mockOnline = false;
    mockLoad.mockRejectedValue(new Error('offline'));
    const { result, rerender } = renderHook(() => useUserPreferences('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockOnline = true;
    mockLoad.mockResolvedValue(serverRow({ mode: 'light' }, 4000));
    mockUpdate.mockResolvedValue(serverRow({ mode: 'dark' }, 9000));
    rerender();
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('u1', { theme: { mode: 'dark' } }));
    await waitFor(() => expect(readDeviceTheme('u1')?.pending).toEqual([]));
    expect(result.current.preferences?.theme.mode).toBe('dark');
  });

  it('a newer server value from another device replaces an older local change and is reported', async () => {
    recordLocalThemeChange('u1', { mode: 'dark' }, 5000);
    mockLoad.mockResolvedValue(serverRow({ mode: 'system' }, 6000));
    const onServerTheme = vi.fn();
    const { result } = renderHook(() => useUserPreferences('u1', onServerTheme));
    await waitFor(() => expect(result.current.preferences?.theme.mode).toBe('system'));
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(onServerTheme).toHaveBeenCalledWith({ mode: 'system' });
    expect(readDeviceTheme('u1')?.pending).toEqual([]);
  });

  it('online theme change saves to the device and the server', async () => {
    mockLoad.mockResolvedValue(serverRow({}, 1000));
    mockUpdate.mockResolvedValue(serverRow({ fontSize: 'large' }, 9000));
    const { result } = renderHook(() => useUserPreferences('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.updatePreferences({ theme: { fontSize: 'large' } }));
    expect(mockUpdate).toHaveBeenCalledWith('u1', { theme: { fontSize: 'large' } });
    expect(result.current.preferences?.theme.fontSize).toBe('large');
    expect(readDeviceTheme('u1')?.pending).toEqual([]);
  });

  it('a failed server save keeps a theme change on the device, pending', async () => {
    mockLoad.mockResolvedValue(serverRow({}, 1000));
    mockUpdate.mockRejectedValue(new Error('500'));
    const { result } = renderHook(() => useUserPreferences('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.updatePreferences({ theme: { highContrast: true } }));
    expect(result.current.preferences?.theme.highContrast).toBe(true);
    expect(readDeviceTheme('u1')?.pending).toEqual(['highContrast']);
  });
});
