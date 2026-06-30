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
    expect(mockUpdateTrial).toHaveBeenCalledWith('t1', { registryId: 'UKC' });
    expect(mockUpdateTrial).toHaveBeenCalledWith('t2', { registryId: 'UKC' });
  });

  it('skips trials already on the correct registry (idempotent / no redundant writes)', async () => {
    mockGetTrialsByShow.mockResolvedValue([trial('t1', 'UKC'), trial('t2', 'AKC')]);

    const updated = await resyncTrialRegistry('show-1', 'UKC');

    expect(updated).toBe(1);
    expect(mockUpdateTrial).toHaveBeenCalledTimes(1);
    expect(mockUpdateTrial).toHaveBeenCalledWith('t2', { registryId: 'UKC' });
  });

  it('derives AKC for a non-registry organization and resyncs trials accordingly', async () => {
    // Show org changed UKC → NACSW (no registry config) → trials must fall back to AKC.
    mockGetTrialsByShow.mockResolvedValue([trial('t1', 'UKC')]);

    const updated = await resyncTrialRegistry('show-1', 'NACSW');

    expect(updated).toBe(1);
    expect(mockUpdateTrial).toHaveBeenCalledWith('t1', { registryId: 'AKC' });
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
    expect(mockUpdateTrial).toHaveBeenCalledWith('t1', { registryId: 'ASCA' });
  });
});
