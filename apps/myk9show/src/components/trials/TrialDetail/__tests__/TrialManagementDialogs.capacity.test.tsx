/**
 * MYK9-998 (Codex round 4 on #2735): Edit class from Trial Details. TrialDetailsPage hand-builds
 * the class it passes to the editor; a field left out of that projection hides the limit and
 * wait list controls even though the read loaded them. Real projection, real dialogs, real panel.
 */
import React from 'react';
import { act, createTestQueryClient, render, screen, waitFor } from '@/test/utils/testUtils';
import { describe, it, expect, vi } from 'vitest';
import {
  TrialManagementDialogs,
  type TrialManagementDialogsHandle,
} from '../TrialManagementDialogs';
import { toTrialDetailClass } from '@/pages/trialDetailClassProjection';
import type { TrialWithClasses } from '@/hooks/useTrialDetailData';
import type { Show } from '@/types/show-types';
import type { QueryClient } from '@tanstack/react-query';
import type { SyncableClassData } from '@/store/class-store-types';

const updateClass = vi.hoisted(() => vi.fn());
const syncReplica = vi.hoisted(() => vi.fn());
const appClient = vi.hoisted(() => ({ current: undefined as QueryClient | undefined }));
vi.mock('@/lib/queryClient', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  get queryClient() {
    return appClient.current!;
  },
}));
vi.mock('@/hooks/useConnectionHint', () => ({ useConnectionHint: () => undefined }));
vi.mock('@/services/replication', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication')>()),
  replicatedClassesTable: { sync: syncReplica },
}));
vi.mock('@/hooks/useClassStoreCompat', () => ({ useClassStoreCompat: () => ({ updateClass }) }));
vi.mock('@/store/trialStore', () => {
  const state = { trials: [], updateTrial: vi.fn(), loadTrialClasses: vi.fn() };
  return { useTrialStore: Object.assign(() => state, { getState: () => state }) };
});
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/services/database/judges', () => ({ upsertClassJudgeAssignment: vi.fn() }));
vi.mock('@/store/showStore', () => ({ useShowStore: () => ({ shows: [] }) }));
vi.mock('@/store/userStore', () => ({ useUserStore: () => ({ people: [] }) }));
vi.mock('@/hooks/useClassRequirements', () => ({
  useClassRequirements: () => ({ autoFill: undefined }),
}));

const loadedClass = {
  id: 'c1',
  trialId: 't1',
  element: 'Container',
  level: 'Novice',
  section: 'A',
  status: 'Scheduled',
  judge: 'J',
  judgeId: 'j1',
  startTime: '2026-05-09T09:00:00',
  maxEntries: 12,
  allowsWaitlist: false,
} as unknown as SyncableClassData;

describe('Trial Details Edit class: limit and wait list', () => {
  it('shows the loaded controls and toggling sends allowsWaitlist', async () => {
    updateClass.mockReset();
    updateClass.mockResolvedValue(undefined);
    syncReplica.mockReset();
    syncReplica.mockResolvedValue(undefined);
    const ref = React.createRef<TrialManagementDialogsHandle>();
    const { user } = render(
      <TrialManagementDialogs
        ref={ref}
        currentTrial={
          {
            id: 't1',
            name: 'T',
            trialNumber: '1',
            trialDate: '2026-05-09',
            showId: 's1',
            classes: [],
          } as unknown as TrialWithClasses
        }
        parentShow={{ id: 's1', organization: 'AKC' } as Show}
      />,
      {
        initialRoute: '/shows/s1/trials/t1',
        queryClient: (appClient.current = createTestQueryClient()),
      }
    );
    act(() => ref.current?.openEditClass(toTrialDetailClass(loadedClass, 3)));

    expect(await screen.findByLabelText(/Entry limit/)).toHaveValue(12);
    await user.click(screen.getByRole('switch', { name: 'Allow wait list' }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(updateClass).toHaveBeenCalled());
    const payload = updateClass.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload).toMatchObject({ allowsWaitlist: true });
    expect(payload).not.toHaveProperty('maxEntries');
  });

  // Codex round 5 on #2735: the replica was refreshed only BEFORE the write, so reopening Edit
  // class straight after Save read the old limit and wait list. The shared save refreshes after.
  it('refreshes the class replica after the update, not only before it', async () => {
    updateClass.mockReset();
    updateClass.mockResolvedValue(undefined);
    syncReplica.mockReset();
    syncReplica.mockResolvedValue(undefined);
    const ref = React.createRef<TrialManagementDialogsHandle>();
    const { user } = render(
      <TrialManagementDialogs
        ref={ref}
        currentTrial={
          {
            id: 't1',
            name: 'T',
            trialNumber: '1',
            trialDate: '2026-05-09',
            showId: 's1',
            classes: [],
          } as unknown as TrialWithClasses
        }
        parentShow={{ id: 's1', organization: 'AKC' } as Show}
      />,
      {
        initialRoute: '/shows/s1/trials/t1',
        queryClient: (appClient.current = createTestQueryClient()),
      }
    );
    act(() => ref.current?.openEditClass(toTrialDetailClass(loadedClass, 3)));
    await user.click(await screen.findByRole('switch', { name: 'Allow wait list' }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(syncReplica).toHaveBeenCalled());
    const updateOrder = updateClass.mock.invocationCallOrder[0]!;
    expect(syncReplica.mock.invocationCallOrder.some(order => order > updateOrder)).toBe(true);
  });
});
