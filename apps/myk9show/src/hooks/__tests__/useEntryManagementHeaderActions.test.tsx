import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { usePageEditTargetStore } from '@/features/actions/pageEditTarget';
import { TRIAL_SECRETARY_ONLY_REASON } from '@/features/actions/trialSecretaryAccess';
import { useEntryManagementHeaderActions } from '../useEntryManagementHeaderActions';

const getClassesWithCapacityMock = vi.hoisted(() => vi.fn());
vi.mock('@/services/database/day-of-operations', () => ({
  getClassesWithCapacity: getClassesWithCapacityMock,
}));

const counts = { pulls: 0, moveUps: 0, registrationNeeded: 0 };
const lateEntry = () =>
  usePageEditTargetStore.getState().showTools?.tools.find(tool => tool.id === 'late-entry');

function mount(secretaryOnlyReason?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    ({ entriesVersion }: { entriesVersion: string }) =>
      useEntryManagementHeaderActions({
        showId: 'show-1',
        canManage: true,
        counts,
        secretaryOnlyReason,
        entriesVersion,
        exportEnabled: false,
        onExport: vi.fn(),
      }),
    { wrapper, initialProps: { entriesVersion: '1:100' } }
  );
}

describe('Add late entry row capacity gate', () => {
  beforeEach(() => {
    getClassesWithCapacityMock.mockReset();
    usePageEditTargetStore.setState({ showTools: null, showToolsOwner: null, exports: [] });
  });

  it('stays enabled while class availability loads, then when a class has space', async () => {
    getClassesWithCapacityMock.mockResolvedValue({
      data: [{ available_spots: 3 }],
      error: null,
    });
    mount();

    expect(lateEntry()?.disabledReason).toBeUndefined();
    await waitFor(() => expect(getClassesWithCapacityMock).toHaveBeenCalledWith('show-1'));
    expect(lateEntry()?.disabledReason).toBeUndefined();
  });

  it('is disabled when no class has space', async () => {
    getClassesWithCapacityMock.mockResolvedValue({
      data: [{ available_spots: 0 }],
      error: null,
    });
    mount();

    await waitFor(() => expect(lateEntry()?.disabledReason).toBe('No classes with space'));
  });

  it('is disabled when class availability cannot load', async () => {
    getClassesWithCapacityMock.mockRejectedValue(new Error('capacity unavailable'));
    mount();

    await waitFor(() =>
      expect(lateEntry()?.disabledReason).toBe('Class availability is unavailable')
    );
  });

  it('re-reads capacity when the entries change, so a pull that frees a spot re-enables it', async () => {
    getClassesWithCapacityMock.mockResolvedValueOnce({
      data: [{ available_spots: 0 }],
      error: null,
    });
    const { rerender } = mount();
    await waitFor(() => expect(lateEntry()?.disabledReason).toBe('No classes with space'));

    getClassesWithCapacityMock.mockResolvedValueOnce({
      data: [{ available_spots: 1 }],
      error: null,
    });
    rerender({ entriesVersion: '1:200' });

    await waitFor(() => expect(lateEntry()?.disabledReason).toBeUndefined());
    expect(getClassesWithCapacityMock).toHaveBeenCalledTimes(2);
  });

  it('shows the role reason, and reads no capacity at all, for a viewer who is not the trial secretary', () => {
    mount(TRIAL_SECRETARY_ONLY_REASON);

    expect(lateEntry()?.disabledReason).toBe(TRIAL_SECRETARY_ONLY_REASON);
    expect(getClassesWithCapacityMock).not.toHaveBeenCalled();
  });
});
