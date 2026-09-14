import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resyncTrialRegistry } from '../resyncTrialRegistry';

const mockGetTrialsByShow = vi.fn();
const mockUpdateTrial = vi.fn();

vi.mock('@/services/replication', () => ({
  replicatedTrialsTable: {
    getTrialsByShow: (...args: unknown[]) => mockGetTrialsByShow(...args),
    updateTrial: (...args: unknown[]) => mockUpdateTrial(...args),
  },
}));

function trial(id: string, registryId: string | undefined) {
  return { id, showId: 'show-1', name: id, date: '2026-06-12', registryId };
}

describe('resyncTrialRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateTrial.mockResolvedValue('mutation-1');
  });

  it('updates every out-of-sync trial to the registry derived from the new organization', async () => {
    mockGetTrialsByShow.mockResolvedValue([trial('t1', 'AKC'), trial('t2', 'AKC')]);

    const updated = await resyncTrialRegistry('show-1', 'UKC');

    expect(updated).toBe(2);
    expect(mockUpdateTrial).toHaveBeenCalledWith('t1', { registryId: 'UKC' }, undefined);
    expect(mockUpdateTrial).toHaveBeenCalledWith('t2', { registryId: 'UKC' }, undefined);
  });

  it('skips trials already on the correct registry (idempotent / no redundant writes)', async () => {
    mockGetTrialsByShow.mockResolvedValue([trial('t1', 'UKC'), trial('t2', 'AKC')]);

    const updated = await resyncTrialRegistry('show-1', 'UKC');

    expect(updated).toBe(1);
    expect(mockUpdateTrial).toHaveBeenCalledTimes(1);
    expect(mockUpdateTrial).toHaveBeenCalledWith('t2', { registryId: 'UKC' }, undefined);
  });

  it('derives AKC for a non-registry organization and resyncs trials accordingly', async () => {
    // Show org changed UKC → NACSW (no registry config) → trials must fall back to AKC.
    mockGetTrialsByShow.mockResolvedValue([trial('t1', 'UKC')]);

    const updated = await resyncTrialRegistry('show-1', 'NACSW');

    expect(updated).toBe(1);
    expect(mockUpdateTrial).toHaveBeenCalledWith('t1', { registryId: 'AKC' }, undefined);
  });

  it('is a no-op when all trials already match', async () => {
    mockGetTrialsByShow.mockResolvedValue([trial('t1', 'ASCA'), trial('t2', 'ASCA')]);

    const updated = await resyncTrialRegistry('show-1', 'ASCA');

    expect(updated).toBe(0);
    expect(mockUpdateTrial).not.toHaveBeenCalled();
  });

  it('treats a trial with no stored registry as out of sync against the AKC default', async () => {
    mockGetTrialsByShow.mockResolvedValue([trial('t1', undefined)]);

    const updated = await resyncTrialRegistry('show-1', 'ASCA');

    expect(updated).toBe(1);
    expect(mockUpdateTrial).toHaveBeenCalledWith('t1', { registryId: 'ASCA' }, undefined);
  });

  it('passes the show mutation id to every trial update as dependsOn (MYK9-490)', async () => {
    // MYK9-490: the server refuses a trial whose registry_id disagrees with its show's
    // organization (SQLSTATE MK490). Offline, the show update and these trial updates are
    // separate queue entries, and MutationUploadRunner uploads an independent mutation even
    // while an earlier one is held back (backoff, an unresolved conflict, containment). A
    // trial update that overtook the organization change would be refused, and refused again
    // on every retry. Naming the show mutation makes the runner hold them until it lands.
    mockGetTrialsByShow.mockResolvedValue([trial('t1', 'AKC'), trial('t2', 'AKC')]);

    const updated = await resyncTrialRegistry('show-1', 'UKC', ['show-mutation-1']);

    expect(updated).toBe(2);
    expect(mockUpdateTrial).toHaveBeenCalledWith('t1', { registryId: 'UKC' }, ['show-mutation-1']);
    expect(mockUpdateTrial).toHaveBeenCalledWith('t2', { registryId: 'UKC' }, ['show-mutation-1']);
  });

  it('no-ops safely on a cold/incomplete local replica (no trials present)', async () => {
    // If the show's org changes before its trials have synced into IndexedDB,
    // getTrialsByShow returns []. This replica-bound helper can do nothing locally and
    // must not throw; correctness for that case is the authoritative DB trigger's job
    // (migration 20260701120000_sync_trial_registry_on_show_org_change), not this helper.
    mockGetTrialsByShow.mockResolvedValue([]);

    const updated = await resyncTrialRegistry('show-1', 'UKC');

    expect(updated).toBe(0);
    expect(mockUpdateTrial).not.toHaveBeenCalled();
  });
});
