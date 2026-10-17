import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  upsert: vi.fn(),
  select: vi.fn(),
  deleteEq: vi.fn(),
  deleteIn: vi.fn(),
  selectEq: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({ supabase: { from: mocks.from } }));

import { getClubRegistryNumbers, saveClubRegistryNumbers } from './registryNumbers';

describe('club registry numbers service (MYK9-1235)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.deleteIn.mockResolvedValue({ error: null });
    mocks.deleteEq.mockReturnValue({ in: mocks.deleteIn });
    mocks.selectEq.mockResolvedValue({ data: [], error: null });
    mocks.select.mockReturnValue({ eq: mocks.selectEq });
    mocks.from.mockReturnValue({
      upsert: mocks.upsert,
      select: mocks.select,
      delete: () => ({ eq: mocks.deleteEq }),
    });
  });

  it('saves two numbers for one club as one upsert keyed on club and organization', async () => {
    await saveClubRegistryNumbers('club-1', { AKC: ' 4521 ', UKC: 'U-9' });

    expect(mocks.from).toHaveBeenCalledWith('club_registry_numbers');
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledWith(
      [
        { club_id: 'club-1', organization: 'AKC', number: '4521' },
        { club_id: 'club-1', organization: 'UKC', number: 'U-9' },
      ],
      { onConflict: 'club_id,organization' }
    );
    // The organization left blank (ASCA) is removed, and only that one.
    expect(mocks.deleteEq).toHaveBeenCalledWith('club_id', 'club-1');
    expect(mocks.deleteIn).toHaveBeenCalledWith('organization', ['ASCA']);
  });

  it('removes the rows of cleared fields and upserts nothing when all are blank', async () => {
    await saveClubRegistryNumbers('club-1', { AKC: '', UKC: '  ', ASCA: undefined });

    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.deleteIn).toHaveBeenCalledWith('organization', ['AKC', 'UKC', 'ASCA']);
  });

  it('does not delete when all three organizations have a number', async () => {
    await saveClubRegistryNumbers('club-1', { AKC: '1', UKC: '2', ASCA: '3' });

    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.deleteIn).not.toHaveBeenCalled();
  });

  it('throws the database error so the Edit Club panel stays open', async () => {
    mocks.upsert.mockResolvedValue({ error: new Error('RLS denied') });

    await expect(saveClubRegistryNumbers('club-1', { AKC: '1' })).rejects.toThrow('RLS denied');
    expect(mocks.deleteIn).not.toHaveBeenCalled();
  });

  it("reads a club's numbers keyed by organization", async () => {
    mocks.selectEq.mockResolvedValue({
      data: [
        { organization: 'AKC', number: '4521' },
        { organization: 'UKC', number: 'U-9' },
      ],
      error: null,
    });

    await expect(getClubRegistryNumbers('club-1')).resolves.toEqual({ AKC: '4521', UKC: 'U-9' });
    expect(mocks.select).toHaveBeenCalledWith('organization, number');
    expect(mocks.selectEq).toHaveBeenCalledWith('club_id', 'club-1');
  });
});
