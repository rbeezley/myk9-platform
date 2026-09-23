import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Show } from '@/types/show-types';
import { showQueryKeys } from '@/hooks/queries/useShowsDatabase';
import { saveShowDraftStyle } from './showStylePersistence';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rpc: vi.fn(),
  getReplicatedRow: vi.fn(),
  setReplicaRow: vi.fn(),
  getPendingForRow: vi.fn(),
  boundClient: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { auth: { getSession: mocks.getSession } },
  createSessionBoundSupabaseClient: (token: string) => mocks.boundClient(token),
}));

vi.mock('@/services/replication/sharedMutationManager', () => ({
  mutationManager: { getPendingMutationsForRow: mocks.getPendingForRow },
}));

vi.mock('@/services/replication', () => ({
  replicatedShowsTable: {
    getReplicatedRow: mocks.getReplicatedRow,
    set: mocks.setReplicaRow,
  },
}));

const show = {
  id: 'show-1',
  name: 'Bluegrass Classic',
  style: 'monogram',
  location: 'Louisville',
} as Show;

function makeQueryClient(): QueryClient {
  const queryClient = new QueryClient();
  queryClient.setQueryData(showQueryKeys.detail(show.id), show);
  queryClient.setQueryData(showQueryKeys.lists(), [show]);
  queryClient.setQueryData(showQueryKeys.statistics(), { total: 1 });
  return queryClient;
}

function setOnline(value: boolean): () => void {
  const original = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
  return () => {
    if (original) Object.defineProperty(navigator, 'onLine', original);
    else Reflect.deleteProperty(navigator, 'onLine');
  };
}

describe('saveShowDraftStyle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'owner-1' }, access_token: 'token-1' } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: 9, error: null });
    mocks.getReplicatedRow.mockResolvedValue({ isDirty: false });
    mocks.getPendingForRow.mockResolvedValue([]);
    mocks.boundClient.mockImplementation((token: string) => ({ rpc: mocks.rpc, token }));
  });

  it('does not call the RPC or mutate local data while offline', async () => {
    const restoreOnline = setOnline(false);
    const queryClient = makeQueryClient();
    try {
      await expect(
        saveShowDraftStyle({ show, style: 'heritage', ownerId: 'owner-1' })
      ).rejects.toThrow('Reconnect to the internet');
      expect(mocks.getSession).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.setReplicaRow).not.toHaveBeenCalled();
      expect(queryClient.getQueryData<Show>(showQueryKeys.detail(show.id))?.style).toBe('monogram');
    } finally {
      restoreOnline();
    }
  });

  it('uses the captured session RPC and nudges normal sync without writing replica or caches', async () => {
    const queryClient = makeQueryClient();
    let syncRequested = false;
    const listener = () => {
      syncRequested = true;
    };
    window.addEventListener('replication:sync-requested', listener);
    try {
      await saveShowDraftStyle({ show, style: 'heritage', ownerId: 'owner-1' });
    } finally {
      window.removeEventListener('replication:sync-requested', listener);
    }

    expect(mocks.boundClient).toHaveBeenCalledWith('token-1');
    expect(mocks.rpc).toHaveBeenCalledWith('update_show_style', {
      p_show_id: 'show-1',
      p_style: 'heritage',
    });
    expect(syncRequested).toBe(true);
    expect(mocks.setReplicaRow).not.toHaveBeenCalled();
    expect(queryClient.getQueryData<Show>(showQueryKeys.detail(show.id))?.style).toBe('monogram');
    expect(queryClient.getQueryData<Show[]>(showQueryKeys.lists())?.[0]?.style).toBe('monogram');
    expect(queryClient.getQueryData(showQueryKeys.statistics())).toEqual({ total: 1 });
  });

  it('does not save while the show row or mutation queue has pending work', async () => {
    mocks.getReplicatedRow.mockResolvedValueOnce({ isDirty: true });
    await expect(
      saveShowDraftStyle({ show, style: 'heritage', ownerId: 'owner-1' })
    ).rejects.toThrow('Sync this show’s pending changes');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.setReplicaRow).not.toHaveBeenCalled();

    mocks.getReplicatedRow.mockResolvedValueOnce({ isDirty: false });
    mocks.getPendingForRow.mockResolvedValueOnce([{ id: 'pending-show-update' }]);
    await expect(
      saveShowDraftStyle({ show, style: 'heritage', ownerId: 'owner-1' })
    ).rejects.toThrow('Sync this show’s pending changes');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rechecks the owner after async preflight before invoking the RPC', async () => {
    let currentOwner = 'owner-1';
    mocks.getSession.mockImplementation(async () => ({
      data: { session: { user: { id: currentOwner }, access_token: `${currentOwner}-token` } },
      error: null,
    }));
    let enteredPreflight!: () => void;
    let finishPreflight!: () => void;
    const preflightStarted = new Promise<void>(resolve => {
      enteredPreflight = resolve;
    });
    const preflightGate = new Promise<void>(resolve => {
      finishPreflight = resolve;
    });
    mocks.getPendingForRow.mockImplementationOnce(async () => {
      enteredPreflight();
      await preflightGate;
      return [];
    });

    const save = saveShowDraftStyle({ show, style: 'heritage', ownerId: 'owner-1' });
    await preflightStarted;
    currentOwner = 'owner-2';
    finishPreflight();

    await expect(save).rejects.toThrow('Your account changed');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('leaves replica and warm readers unchanged when the RPC fails', async () => {
    const queryClient = makeQueryClient();
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('permission denied') });

    await expect(
      saveShowDraftStyle({ show, style: 'heritage', ownerId: 'owner-1' })
    ).rejects.toThrow('permission denied');

    expect(mocks.setReplicaRow).not.toHaveBeenCalled();
    expect(queryClient.getQueryData<Show>(showQueryKeys.detail(show.id))?.style).toBe('monogram');
  });

  it('does not request sync when authentication changes while the RPC is in flight', async () => {
    mocks.getSession
      .mockResolvedValueOnce({
        data: { session: { user: { id: 'owner-1' }, access_token: 'token-1' } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { session: { user: { id: 'owner-1' }, access_token: 'token-1' } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { session: { user: { id: 'owner-2' }, access_token: 'token-2' } },
        error: null,
      });
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    await expect(
      saveShowDraftStyle({ show, style: 'heritage', ownerId: 'owner-1' })
    ).rejects.toThrow(
      'The style may have been saved, but your account changed or could not be confirmed'
    );

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.setReplicaRow).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'replication:sync-requested' })
    );
    dispatchSpy.mockRestore();
  });
});
