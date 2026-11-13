import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { SYNC_INTERVAL_MS } from '@myk9/replication';
import { replicatedTrialsTable } from '@/services/replication';
import { resetSyncCadence } from '../syncCadence';
import type { UploadSyncTarget } from '../ringsideUploadSyncTargets';
import {
  getMountedShowIds,
  registerMountedShow,
  resetMountedShows,
  targetsForTables,
  unregisterMountedShow,
} from '../showScopeTargets';
import { useSyncPassScheduler } from '../useSyncPassScheduler';

vi.mock('@/services/replication', () => ({
  replicatedTrialsTable: { getTrialsByShow: vi.fn() },
}));

type Trigger = (targets?: UploadSyncTarget[]) => Promise<void>;
let trigger: ReturnType<typeof vi.fn<Trigger>>;
let triggerRef: MutableRefObject<Trigger | undefined>;

const mount = () => renderHook(() => useSyncPassScheduler(true, triggerRef));
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const scopedCalls = () => trigger.mock.calls.filter(([targets]) => targets !== undefined);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  resetSyncCadence();
  resetMountedShows();
  trigger = vi.fn<Trigger>().mockResolvedValue(undefined);
  triggerRef = { current: trigger };
  vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([
    { id: 'trial-1' },
    { id: 'trial-2' },
  ] as never);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('mounted show registry', () => {
  it('two mounts of one show register it once, and it stays until both unmount', () => {
    const a = registerMountedShow('show-1');
    const b = registerMountedShow('show-1');
    expect(getMountedShowIds()).toEqual(['show-1']);
    unregisterMountedShow(a);
    expect(getMountedShowIds()).toEqual(['show-1']);
    unregisterMountedShow(b);
    expect(getMountedShowIds()).toEqual([]);
  });
});

describe('provider pass covers mounted shows', () => {
  it('the poll requests the registered show scoped entries and classes', async () => {
    registerMountedShow('show-1');
    mount();
    await advance(SYNC_INTERVAL_MS);
    expect(trigger).toHaveBeenCalledWith();
    expect(scopedCalls()).toEqual([
      [
        [
          { name: 'entries', scopeId: 'show-1' },
          { name: 'classes', scopeId: 'trial-1' },
          { name: 'classes', scopeId: 'trial-2' },
        ],
      ],
    ]);
  });

  it('requests no scoped pass when no show is registered', async () => {
    mount();
    await advance(SYNC_INTERVAL_MS);
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(scopedCalls()).toEqual([]);
  });

  it('stops requesting a show once it is unregistered', async () => {
    const token = registerMountedShow('show-1');
    mount();
    unregisterMountedShow(token);
    await advance(SYNC_INTERVAL_MS);
    expect(scopedCalls()).toEqual([]);
  });

  it('the visibility catch-up pass includes registered shows', async () => {
    registerMountedShow('show-1');
    mount();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(scopedCalls()).toHaveLength(1);
    expect(scopedCalls()[0][0]).toContainEqual({ name: 'entries', scopeId: 'show-1' });
  });

  it('still requests entries for a show with no trials', async () => {
    vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([]);
    registerMountedShow('show-1');
    mount();
    await advance(SYNC_INTERVAL_MS);
    expect(scopedCalls()).toEqual([[[{ name: 'entries', scopeId: 'show-1' }]]]);
  });
});

describe('targetsForTables (broadcast contract)', () => {
  it('scopes entries and asks for the full pass when a classes change has no trials', async () => {
    vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([]);
    await expect(targetsForTables('show-1', new Set(['entries', 'classes']))).resolves.toEqual({
      targets: [{ name: 'entries', scopeId: 'show-1' }],
      fullPass: true,
    });
  });

  it('asks for the full pass when the trials lookup fails, keeping the entries target', async () => {
    vi.mocked(replicatedTrialsTable.getTrialsByShow).mockRejectedValue(new Error('idb'));
    await expect(targetsForTables('show-1', new Set(['entries', 'classes']))).resolves.toEqual({
      targets: [{ name: 'entries', scopeId: 'show-1' }],
      fullPass: true,
    });
  });

  it('needs no full pass when every class change can be scoped to a trial', async () => {
    await expect(targetsForTables('show-1', new Set(['classes']))).resolves.toEqual({
      targets: [
        { name: 'classes', scopeId: 'trial-1' },
        { name: 'classes', scopeId: 'trial-2' },
      ],
      fullPass: false,
    });
  });
});
