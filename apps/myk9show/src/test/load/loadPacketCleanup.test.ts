import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { clearLoadTrialPacketSnapshots } from './loadPacketCleanup';
import type { ApiResult, RetryPolicy } from './loadPacketCleanupRetry';

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const SNAPSHOTS = [
  { id: 'snapshot-a1', storage_path: `${SHOW_ID}/packet-a.pdf` },
  { id: 'snapshot-a2', storage_path: `${SHOW_ID}/packet-a.pdf` },
  { id: 'snapshot-b1', storage_path: `${SHOW_ID}/packet-b.pdf` },
];
const OK = { data: SNAPSHOTS, error: null, status: 200 };
const VERIFIED = { data: [], error: null, status: 200 };
// The run 39390552156 response: a gateway timeout whose body is plain text.
const GATEWAY_TIMEOUT = {
  data: null,
  error: { message: 'upstream request timeout', code: '', details: '', hint: '' },
  status: 504,
};

function createClient(options?: {
  reads?: ApiResult<unknown>[];
  removes?: ApiResult<unknown>[];
  concurrentSnapshot?: boolean;
}) {
  const reads = options?.reads ?? [
    OK,
    options?.concurrentSnapshot ? { data: [{ id: 'snapshot-c1' }], error: null } : VERIFIED,
  ];
  const selectEq = vi.fn();
  for (const read of reads) selectEq.mockResolvedValueOnce(read);
  const deleteIn = vi.fn().mockResolvedValue({ data: null, error: null, status: 204 });
  const remove = vi.fn();
  for (const result of options?.removes ?? [{ data: [], error: null }]) {
    remove.mockResolvedValueOnce(result);
  }
  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({ eq: selectEq }),
    delete: vi.fn().mockReturnValue({ in: deleteIn }),
  });
  const storageFrom = vi.fn().mockReturnValue({ remove });
  const client = { from, storage: { from: storageFrom } } as unknown as SupabaseClient;

  return { client, deleteIn, remove, selectEq, storageFrom };
}

function retryPolicy(): RetryPolicy & { sleeps: number[]; logs: string[] } {
  const sleeps: number[] = [];
  const logs: string[] = [];
  return {
    attempts: 4,
    baseDelayMs: 2_000,
    now: () => 0,
    sleep: async ms => {
      sleeps.push(ms);
    },
    log: message => logs.push(message),
    sleeps,
    logs,
  };
}

describe('load trial packet cleanup', () => {
  it('removes each immutable object before deleting its audit rows', async () => {
    const { client, deleteIn, remove, storageFrom } = createClient();

    await expect(clearLoadTrialPacketSnapshots(client, SHOW_ID, retryPolicy())).resolves.toEqual({
      objectsRemoved: 2,
      rowsRemoved: 3,
    });
    expect(storageFrom).toHaveBeenCalledWith('trial-packets');
    expect(remove).toHaveBeenCalledWith([`${SHOW_ID}/packet-a.pdf`, `${SHOW_ID}/packet-b.pdf`]);
    expect(deleteIn).toHaveBeenCalledWith('id', ['snapshot-a1', 'snapshot-a2', 'snapshot-b1']);
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(deleteIn.mock.invocationCallOrder[0]!);
  });

  it('preserves audit rows when storage refuses the deletion, without retrying a 4xx', async () => {
    const { client, deleteIn, remove } = createClient({
      removes: [
        {
          data: null,
          error: { message: 'Bucket not found', status: 404, statusCode: '404' },
        },
      ],
    });
    const retry = retryPolicy();

    await expect(clearLoadTrialPacketSnapshots(client, SHOW_ID, retry)).rejects.toThrow(
      'Could not remove trial packet objects: Bucket not found (HTTP 404) after 1 attempt (not retried: not a transient failure)'
    );
    expect(remove).toHaveBeenCalledTimes(1);
    expect(retry.sleeps).toEqual([]);
    expect(deleteIn).not.toHaveBeenCalled();
  });

  it('retries the gateway timeout that failed run 39390552156 and then completes', async () => {
    const { client, deleteIn, selectEq } = createClient({
      reads: [GATEWAY_TIMEOUT, GATEWAY_TIMEOUT, OK, VERIFIED],
    });
    const retry = retryPolicy();

    await expect(clearLoadTrialPacketSnapshots(client, SHOW_ID, retry)).resolves.toEqual({
      objectsRemoved: 2,
      rowsRemoved: 3,
    });
    expect(selectEq).toHaveBeenCalledTimes(4);
    expect(retry.sleeps).toEqual([2_000, 4_000]);
    expect(retry.logs[0]).toBe(
      'Could not read trial packet snapshots: attempt 1/4 failed, upstream request timeout (HTTP 504); retrying in 2000 ms.'
    );
    expect(deleteIn).toHaveBeenCalledTimes(1);
  });

  it('names the status and attempt count once a Cloudflare 52x outlasts the retries', async () => {
    const originError = { data: null, error: { message: '' }, status: 522 };
    const { client, remove } = createClient({ reads: Array(4).fill(originError) });
    const retry = retryPolicy();

    await expect(clearLoadTrialPacketSnapshots(client, SHOW_ID, retry)).rejects.toThrow(
      'Could not read trial packet snapshots: no error message (HTTP 522) after 4 attempts'
    );
    expect(retry.sleeps).toEqual([2_000, 4_000, 8_000]);
    expect(remove).not.toHaveBeenCalled();
  });

  it('stops retrying once the shared deadline would pass, and says so', async () => {
    const { client } = createClient({ reads: [GATEWAY_TIMEOUT, GATEWAY_TIMEOUT, OK, VERIFIED] });
    const retry = { ...retryPolicy(), deadlineAtMs: 2_000 };

    await expect(clearLoadTrialPacketSnapshots(client, SHOW_ID, retry)).rejects.toThrow(
      'Could not read trial packet snapshots: upstream request timeout (HTTP 504) after 1 attempt (retry budget exhausted)'
    );
    expect(retry.sleeps).toEqual([]);
  });

  it('retries a storage call that got no HTTP response at all', async () => {
    const { client, remove } = createClient({
      removes: [
        { data: null, error: { message: 'fetch failed', status: undefined } },
        { data: [], error: null },
      ],
    });
    const retry = retryPolicy();

    await clearLoadTrialPacketSnapshots(client, SHOW_ID, retry);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(retry.logs[0]).toContain('fetch failed (no HTTP response)');
  });

  it('fails closed when a snapshot appears during cleanup', async () => {
    const { client, deleteIn } = createClient({ concurrentSnapshot: true });

    await expect(clearLoadTrialPacketSnapshots(client, SHOW_ID, retryPolicy())).rejects.toThrow(
      'appeared during cleanup'
    );
    expect(deleteIn).toHaveBeenCalledWith('id', ['snapshot-a1', 'snapshot-a2', 'snapshot-b1']);
  });
});
