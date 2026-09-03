import { createTestQueryClient, render, screen } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSettings } from '../DataSettings';

const { mockCount, mockGetState } = vi.hoisted(() => ({
  mockCount: vi.fn(),
  mockGetState: vi.fn(),
}));

vi.mock('@myk9/replication', async importOriginal => {
  const actual = await importOriginal<typeof import('@myk9/replication')>();
  return {
    ...actual,
    databaseManager: { getDatabase: vi.fn(async () => ({ count: mockCount })) },
  };
});

vi.mock('@/store/offlineScoringStore', () => ({
  useOfflineScoringStore: Object.assign(vi.fn(), { getState: mockGetState }),
}));

const mockReload = vi.fn();
vi.spyOn(indexedDB, 'deleteDatabase');
Object.defineProperty(window, 'location', {
  value: { ...window.location, reload: mockReload },
  writable: true,
});

describe('DataSettings cache clear', () => {
  const renderSettings = () => {
    const queryClient = createTestQueryClient();
    const clearSpy = vi.spyOn(queryClient, 'clear');
    return { ...render(<DataSettings />, { queryClient }), clearSpy };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockCount.mockResolvedValue(0);
    mockGetState.mockReturnValue({ syncQueue: [] });
  });

  it('renders clear cache button', () => {
    renderSettings();
    expect(screen.getByRole('button', { name: /clear cache/i })).toBeInTheDocument();
  });

  it('shows the offline-first note', () => {
    renderSettings();
    expect(screen.getByText(/works offline automatically/i)).toBeInTheDocument();
  });

  it('blocks clearing and names pending changes', async () => {
    mockCount.mockResolvedValue(2);
    mockGetState.mockReturnValue({ syncQueue: [{ id: 'score-1' }] });
    const { user, clearSpy } = renderSettings();

    await user.click(screen.getByRole('button', { name: /clear cache/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('3 unsynced changes');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(clearSpy).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();
  });

  it('opens a descriptive confirmation when queues are empty', async () => {
    const { user } = renderSettings();
    await user.click(screen.getByRole('button', { name: /^clear cache$/i }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(/cached show data/i);
    expect(screen.getByRole('button', { name: /keep cached data/i })).toBeInTheDocument();
  });

  it('clears only known disposable storage and preserves replication data', async () => {
    localStorage.setItem('myK9Q_settings', '{"theme":"dark"}');
    localStorage.setItem('sb-abc123-auth-token', '{"access_token":"abc"}');
    localStorage.setItem('myk9-notification-preferences', '{"enabled":true}');
    localStorage.setItem('scroll_shows', '150');

    const queryClient = createTestQueryClient();
    const clearSpy = vi.spyOn(queryClient, 'clear');
    const { user } = render(<DataSettings />, { queryClient });
    await user.click(screen.getByRole('button', { name: /clear cache/i }));
    await user.click(await screen.findByRole('button', { name: /clear cache and reload/i }));

    expect(localStorage.getItem('myK9Q_settings')).toBe('{"theme":"dark"}');
    expect(localStorage.getItem('sb-abc123-auth-token')).toBe('{"access_token":"abc"}');
    expect(localStorage.getItem('myk9-notification-preferences')).toBeNull();
    expect(localStorage.getItem('scroll_shows')).toBe('150');
    expect(clearSpy).toHaveBeenCalled();
    expect(mockReload).toHaveBeenCalled();
    expect(indexedDB.deleteDatabase).toHaveBeenCalledWith('myK9ShowDB');
    expect(indexedDB.deleteDatabase).not.toHaveBeenCalledWith('myK9_Replication');
  });
});
