import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEntriesToday } from './useEntriesToday';
import { useAuthContext } from '@/hooks/useAuthContext';
import { getUserEntries } from '@/services/database/entries';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { showsPaneGroupFor } from '@/components/shows/browse/showsPaneGroups';

vi.mock('@/hooks/useAuthContext');
vi.mock('@/services/database/entries', () => ({ getUserEntries: vi.fn() }));
vi.mock('@/hooks/guestServerRead', () => ({ isAccountSession: () => true }));
vi.mock('@/components/shows/browse/showsPaneGroups', () => ({
  REGROUP_INTERVAL_MS: 60_000,
  showsPaneGroupFor: vi.fn(() => 'today'),
}));
vi.mock('@/utils/entryWindowZones', () => ({
  withEntryWindowTimeZones: (shows: unknown[]) => shows,
}));
vi.mock('@/store/showStore');
vi.mock('@/store/trialStore');

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  (showsPaneGroupFor as ReturnType<typeof vi.fn>).mockReturnValue('today');
  (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
    user: { id: 'user-1' },
    personId: 'person-1',
  });
  (useShowStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (sel: (s: unknown) => unknown) => sel({ shows: [{ id: 'show-1', name: 'Spring Trial' }] })
  );
  (useTrialStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (sel: (s: unknown) => unknown) => sel({ trials: [] })
  );
});

describe('useEntriesToday', () => {
  it('reads the account-level entries, so a show never opened on this device still shows', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        {
          id: 'e1',
          show_id: 'show-1',
          entry_status: 'confirmed',
          check_in_status: 'no-status',
          dog: { name: 'Scout', call_name: 'Scout' },
          class: { name: 'Container Novice A' },
        },
      ],
      error: null,
      source: 'confirmed',
    });
    const { result } = renderHook(() => useEntriesToday(), { wrapper });
    await waitFor(() => expect(result.current.lines).toHaveLength(1));
    expect(getUserEntries).toHaveBeenCalledWith('person-1');
    expect(result.current.lines[0]).toMatchObject({
      entryId: 'e1',
      dogCallName: 'Scout',
      classLabel: 'Container Novice A',
      statusLabel: 'Check in',
    });
    expect(result.current.showNames.get('show-1')).toBe('Spring Trial');
  });
});
