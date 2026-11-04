import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, insertMock, updateMock, eqMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
  eqMock: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: fromMock } }));

import { lunchOrdersService } from '../lunchOrdersService';

describe('lunchOrdersService.save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // eq is chainable and awaitable, like a PostgREST filter builder.
    const builder = {
      eq: eqMock,
      then: (resolve: (v: unknown) => void) => resolve({ error: null }),
    };
    eqMock.mockReturnValue(builder);
    insertMock.mockResolvedValue({ error: null });
    updateMock.mockReturnValue({ eq: eqMock });
    fromMock.mockReturnValue({ insert: insertMock, update: updateMock });
  });

  it('inserts one row for the person and day when none is saved yet', async () => {
    await lunchOrdersService.save({
      trialId: 'trial-1',
      savedId: null,
      personId: 'person-1',
      name: ' Jo Judge ',
      role: 'judge',
      lunchOrder: ' Turkey wrap ',
      dietaryNote: '',
    });

    expect(fromMock).toHaveBeenCalledWith('trial_lunch_orders');
    expect(insertMock).toHaveBeenCalledWith({
      trial_id: 'trial-1',
      person_id: 'person-1',
      name: 'Jo Judge',
      role: 'judge',
      lunch_order: 'Turkey wrap',
      dietary_note: null,
    });
  });

  it('updates only the typed fields on an existing row', async () => {
    await lunchOrdersService.save({
      trialId: 'trial-1',
      savedId: 'row-9',
      personId: 'person-1',
      name: 'Jo Judge',
      role: 'judge',
      lunchOrder: 'Salad',
      dietaryNote: 'Nut allergy',
    });

    expect(updateMock).toHaveBeenCalledWith({ lunch_order: 'Salad', dietary_note: 'Nut allergy' });
    expect(eqMock).toHaveBeenCalledWith('id', 'row-9');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('updates the existing row when another device saved the same person first', async () => {
    insertMock.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } });

    await lunchOrdersService.save({
      trialId: 'trial-1',
      savedId: null,
      personId: 'person-1',
      name: 'Jo Judge',
      role: 'judge',
      lunchOrder: 'Salad',
      dietaryNote: '',
    });

    expect(updateMock).toHaveBeenCalledWith({ lunch_order: 'Salad', dietary_note: null });
    expect(eqMock).toHaveBeenCalledWith('trial_id', 'trial-1');
    expect(eqMock).toHaveBeenCalledWith('person_id', 'person-1');
  });

  it('throws when the insert fails for any other reason', async () => {
    insertMock.mockResolvedValue({ error: { code: '42501', message: 'denied' } });

    await expect(
      lunchOrdersService.save({
        trialId: 'trial-1',
        savedId: null,
        personId: null,
        name: 'Ann',
        role: 'exhibitor',
        lunchOrder: '',
        dietaryNote: '',
      })
    ).rejects.toMatchObject({ code: '42501' });
  });
});
