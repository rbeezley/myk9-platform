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
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('u1', { theme: { mode: 'dark' } }, { mode: 5000 })
    );
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
    expect(onServerTheme).toHaveBeenCalledWith(expect.objectContaining({ mode: 'system' }));
    expect(readDeviceTheme('u1')?.pending).toEqual([]);
  });

  it('offline cold start with nothing saved never waits on the server', async () => {
    mockOnline = false;
    mockLoad.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUserPreferences('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.preferences?.theme).toEqual(DEFAULT_THEME_PREFERENCES);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('a first visit on a new device applies the saved server appearance', async () => {
    mockLoad.mockResolvedValue(serverRow({ mode: 'dark', colorScheme: 'grove' }, 1000));
    const onServerTheme = vi.fn();
    renderHook(() => useUserPreferences('u1', onServerTheme));
    await waitFor(() =>
      expect(onServerTheme).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'dark', colorScheme: 'grove' })
      )
    );
  });

  it('resetting the theme applies the defaults to the live theme', async () => {
    mockOnline = false;
    const onServerTheme = vi.fn();
    const { result } = renderHook(() => useUserPreferences('u1', onServerTheme));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.resetToDefaults('theme'));
    expect(onServerTheme).toHaveBeenCalledWith(DEFAULT_THEME_PREFERENCES);
  });

  it('a later edit waits for an in-flight push and is not undone by it', async () => {
    recordLocalThemeChange('u1', { mode: 'dark' }, 5000);
    let release: (v: unknown) => void = () => {};
    mockLoad.mockResolvedValue(serverRow({ mode: 'light' }, 4000));
    mockUpdate.mockImplementationOnce(() => new Promise(r => (release = r)));
    const { result } = renderHook(() => useUserPreferences('u1'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    mockUpdate.mockResolvedValue(serverRow({ mode: 'system' }, 9000));
    let edit: Promise<void> = Promise.resolve();
    act(() => {
      edit = result.current.updatePreferences({ theme: { mode: 'system' } });
    });
    // One write at a time: the edit's push starts only after the first one lands.
    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    mockLoad.mockResolvedValue(serverRow({ mode: 'dark' }, 8000));
    release(serverRow({ mode: 'dark' }, 8000));
    await act(() => edit);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenLastCalledWith(
      'u1',
      { theme: { mode: 'system' } },
      { mode: expect.any(Number) }
    );
    expect(readDeviceTheme('u1')?.theme.mode).toBe('system');
    expect(readDeviceTheme('u1')?.pending).toEqual([]);
  });

  it('a push the server refuses as older settles to the server value and applies it', async () => {
    recordLocalThemeChange('u1', { mode: 'dark' }, 5000);
    mockLoad.mockResolvedValue(serverRow({ mode: 'light' }, 4000));
    mockUpdate.mockResolvedValue(serverRow({ mode: 'system' }, 9000));
    const onServerTheme = vi.fn();
    const { result } = renderHook(() => useUserPreferences('u1', onServerTheme));
    await waitFor(() => expect(onServerTheme).toHaveBeenCalledWith({ mode: 'system' }));
    expect(readDeviceTheme('u1')?.theme.mode).toBe('system');
    expect(readDeviceTheme('u1')?.pending).toEqual([]);
    expect(result.current.preferences?.theme.mode).toBe('system');
  });

  it('drops a sync result that arrives after the user signed out', async () => {
    let release: (v: unknown) => void = () => {};
    mockLoad.mockImplementationOnce(() => new Promise(r => (release = r)));
    const onServerTheme = vi.fn();
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string | null }) => useUserPreferences(uid, onServerTheme),
      { initialProps: { uid: 'u1' } }
    );
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(1));
    rerender({ uid: null });
    await act(async () => {
      release(serverRow({ mode: 'dark' }, 1000));
    });
    expect(onServerTheme).not.toHaveBeenCalled();
    expect(result.current.preferences).toBeNull();
  });

  it('online theme change saves to the device and the server', async () => {
    mockLoad.mockResolvedValue(serverRow({}, 1000));
    mockUpdate.mockResolvedValue(serverRow({ fontSize: 'large' }, 9000));
    const { result } = renderHook(() => useUserPreferences('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.updatePreferences({ theme: { fontSize: 'large' } }));
    expect(mockUpdate).toHaveBeenCalledWith(
      'u1',
      { theme: { fontSize: 'large' } },
      { fontSize: expect.any(Number) }
    );
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
