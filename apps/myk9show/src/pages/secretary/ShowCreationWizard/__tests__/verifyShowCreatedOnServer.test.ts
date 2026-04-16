import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { verifyShowCreatedOnServer } from '../useShowCreationWizardActions';
import { showQueryKeys } from '@/hooks/queries/useShowsDatabase';
import type { Show } from '@/types/show-types';

type SupabaseResult<T> = { data: T; error: null } | { data: null; error: { message: string } };

function makeSupabaseStub<T>(result: SupabaseResult<T>) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return {
    client: { from } as unknown as Parameters<typeof verifyShowCreatedOnServer>[0]['supabase'],
    from,
    select,
    eq,
    maybeSingle,
  };
}

describe('verifyShowCreatedOnServer', () => {
  const showId = 'a1111111-1111-1111-1111-111111111111';

  let queryClient: QueryClient;
  let removeShow: ReturnType<typeof vi.fn>;
  let replicatedShowsTableStub: { delete: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    queryClient = new QueryClient();
    removeShow = vi.fn();
    replicatedShowsTableStub = { delete: vi.fn().mockResolvedValue(undefined) };
  });

  it('resolves without throwing when the server returns the row', async () => {
    const stub = makeSupabaseStub({ data: { id: showId }, error: null });

    await expect(
      verifyShowCreatedOnServer({
        showId,
        supabase: stub.client,
        replicatedShowsTable: replicatedShowsTableStub as unknown as Parameters<
          typeof verifyShowCreatedOnServer
        >[0]['replicatedShowsTable'],
        removeShow,
        queryClient,
      })
    ).resolves.toBeUndefined();

    expect(stub.from).toHaveBeenCalledWith('shows');
    expect(stub.eq).toHaveBeenCalledWith('id', showId);
    expect(removeShow).not.toHaveBeenCalled();
    expect(replicatedShowsTableStub.delete).not.toHaveBeenCalled();
  });

  it('rolls back local state and throws when the server returns no row', async () => {
    const stub = makeSupabaseStub<{ id: string }>({ data: null, error: null });

    const seededList = [
      { id: showId, name: 'Ghost Show' } as Show,
      { id: 'b2222222-2222-2222-2222-222222222222', name: 'Other Show' } as Show,
    ];
    queryClient.setQueryData<Show[]>(showQueryKeys.lists(), seededList);
    queryClient.setQueryData<Show>(showQueryKeys.detail(showId), seededList[0]!);

    await expect(
      verifyShowCreatedOnServer({
        showId,
        supabase: stub.client,
        replicatedShowsTable: replicatedShowsTableStub as unknown as Parameters<
          typeof verifyShowCreatedOnServer
        >[0]['replicatedShowsTable'],
        removeShow,
        queryClient,
      })
    ).rejects.toThrow(/show was not saved/i);

    expect(removeShow).toHaveBeenCalledWith(showId);
    expect(replicatedShowsTableStub.delete).toHaveBeenCalledWith(showId);
    expect(queryClient.getQueryData(showQueryKeys.detail(showId))).toBeUndefined();
    const list = queryClient.getQueryData<Show[]>(showQueryKeys.lists());
    expect(list).toEqual([seededList[1]]);
  });

  it('surfaces the Postgres error message when the select itself errors', async () => {
    const stub = makeSupabaseStub<{ id: string }>({
      data: null,
      error: { message: 'permission denied for table shows' },
    });

    await expect(
      verifyShowCreatedOnServer({
        showId,
        supabase: stub.client,
        replicatedShowsTable: replicatedShowsTableStub as unknown as Parameters<
          typeof verifyShowCreatedOnServer
        >[0]['replicatedShowsTable'],
        removeShow,
        queryClient,
      })
    ).rejects.toThrow('permission denied for table shows');

    expect(removeShow).toHaveBeenCalledWith(showId);
  });
});
