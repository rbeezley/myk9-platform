import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const maybeSingle = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) }),
  },
}));

import { userPreferencesService } from '@/services/preferences/userPreferencesService';

beforeEach(() => {
  rpc.mockReset();
  maybeSingle.mockReset();
});

describe('preference writes merge in the database (MYK9-1563)', () => {
  it('sends only the changed category, with theme change times, to the merge RPC', async () => {
    rpc.mockResolvedValue({
      data: { theme: { mode: 'dark' }, themeChangedAt: { mode: 5000 } },
      error: null,
    });

    const result = await userPreferencesService.updatePreferences(
      'u1',
      { theme: { mode: 'dark' } },
      { mode: 5000 }
    );

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('merge_user_preferences', {
      p_user_id: 'u1',
      p_app: 'myk9show',
      p_category: 'theme',
      p_patch: { mode: 'dark' },
      p_theme_changed_at: { mode: 5000 },
    });
    expect(result.theme.mode).toBe('dark');
    expect(result.themeChangedAt).toEqual({ mode: 5000 });
  });

  it('returns the value the server kept when a newer one already won', async () => {
    rpc.mockResolvedValue({
      data: { theme: { mode: 'light' }, themeChangedAt: { mode: 8000 } },
      error: null,
    });

    const result = await userPreferencesService.updatePreferences(
      'u1',
      { theme: { mode: 'dark' } },
      { mode: 5000 }
    );

    expect(result.theme.mode).toBe('light');
  });

  it('does not send theme times with another category', async () => {
    rpc.mockResolvedValue({ data: { privacy: { shareStats: true } }, error: null });

    await userPreferencesService.updatePreferences(
      'u1',
      { privacy: { shareStats: true } as never },
      { mode: 5000 }
    );

    expect(rpc).toHaveBeenCalledWith('merge_user_preferences', {
      p_user_id: 'u1',
      p_app: 'myk9show',
      p_category: 'privacy',
      p_patch: { shareStats: true },
    });
  });

  it('merges each changed category in its own call', async () => {
    rpc.mockResolvedValue({ data: {}, error: null });

    await userPreferencesService.updatePreferences('u1', {
      competition: {},
      data: {},
    } as never);

    expect(rpc.mock.calls.map(c => (c[1] as { p_category: string }).p_category)).toEqual([
      'competition',
      'data',
    ]);
  });

  it('surfaces an RPC error so the caller keeps the edit queued', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });

    await expect(
      userPreferencesService.updatePreferences('u1', { theme: { mode: 'dark' } })
    ).rejects.toMatchObject({ message: 'offline' });
  });
});
