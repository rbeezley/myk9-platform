import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockShowsTable } = vi.hoisted(() => ({
  mockShowsTable: {
    getAllWithStatus: vi.fn(),
    subscribe: vi.fn(),
    updateShow: vi.fn(),
  },
}));

vi.mock('@/services/replication', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication')>()),
  replicatedShowsTable: mockShowsTable,
}));
vi.mock('@/config/dataSource', () => ({ shouldUseMockData: () => false }));

import { replicatedToShow, useShowStore } from '../showStore';
import { SHOW_UPDATE_FIELDS } from '../showUpdateFields';
import {
  formDataToShowSaveData,
  showToFormData,
} from '@/components/panels/edit/ShowEditPanel.helpers';
import type { ShowEditFormData } from '@/components/panels/edit/ShowEditPanel.types';
import type { StoreShow } from '@/types/show-types';

describe('showStore.updateShow starting armband (MYK9-2222)', () => {
  beforeEach(() => {
    mockShowsTable.updateShow.mockReset().mockResolvedValue('mutation-1');
    useShowStore.setState({
      shows: [{ id: 'show-1', name: 'Heartland Classic', startingArmbandNumber: 100 } as StoreShow],
      error: null,
      isLoading: false,
    });
  });

  it('writes a changed starting armband to the replicated show row', async () => {
    await useShowStore.getState().updateShow('show-1', { startingArmbandNumber: 500 });
    expect(mockShowsTable.updateShow).toHaveBeenCalledWith(
      'show-1',
      expect.objectContaining({ startingArmbandNumber: 500 })
    );
    expect(useShowStore.getState().shows[0]?.startingArmbandNumber).toBe(500);
  });

  it('leaves the armband alone when the edit does not mention it', async () => {
    await useShowStore.getState().updateShow('show-1', { name: 'Renamed' });
    const [, sent] = mockShowsTable.updateShow.mock.calls[0] ?? [];
    expect(sent).not.toHaveProperty('startingArmbandNumber');
    expect(useShowStore.getState().shows[0]?.startingArmbandNumber).toBe(100);
  });

  it.each([0, -5, 2.5, Number.NaN])('refuses %s and writes nothing', async value => {
    await expect(
      useShowStore.getState().updateShow('show-1', { startingArmbandNumber: value })
    ).rejects.toThrow('positive whole number');
    expect(mockShowsTable.updateShow).not.toHaveBeenCalled();
    expect(useShowStore.getState().shows[0]?.startingArmbandNumber).toBe(100);
  });

  it('keeps the saved armband when the show is rebuilt from the replica (reload)', () => {
    const fromReplica = replicatedToShow({
      id: 'show-1',
      name: 'Heartland Classic',
      startingArmbandNumber: 500,
    } as Parameters<typeof replicatedToShow>[0]);
    expect(fromReplica.startingArmbandNumber).toBe(500);
  });
});

// Every key an Edit show save can send must have a decision in the field map: mapped (it saves)
// or excluded with a reason. A key with neither is the defect MYK9-2220/2221/2222 each fixed once.
describe('Edit show form keys vs the updateShow field map (MYK9-2222)', () => {
  // The panel consumes these from the save data itself; they are not show columns.
  const PANEL_ONLY_KEYS = ['publishExperience', 'generatedPremium', 'inkSaver'];

  const fullForm = (): ShowEditFormData => ({
    ...showToFormData({
      id: 'show-1',
      name: 'Heartland Classic',
      organization: 'AKC',
      clubId: 'club-1',
      location: 'Springfield',
      entryOpenDate: '2026-01-01',
      entryCloseDate: '2026-02-01',
      preEntryFee: '25',
      dayOfShowFee: '30',
      juniorHandlerFee: '10',
      maxEntriesPerDog: 3,
      maxTotalEntries: 80,
      confirmationMessage: 'Hello',
    }),
    ascaSanctionStatus: 'approved',
    scentsByLevel: 'Birch',
    spectatorsPolicy: 'allowed',
    photographerContact: 'photo@example.com',
    publishExperience: true,
    inkSaver: true,
  });

  it('has a decision for every key the form can send', () => {
    const sent = Object.keys(formDataToShowSaveData(fullForm())).filter(
      key => !PANEL_ONLY_KEYS.includes(key)
    );
    expect(sent.length).toBeGreaterThan(10);
    const undecided = sent.filter(key => !(key in SHOW_UPDATE_FIELDS));
    expect(undecided).toEqual([]);
  });

  it('sends startingArmbandNumber, and nothing sends allowNonOwnerHandlers', () => {
    const sent = Object.keys(formDataToShowSaveData(fullForm()));
    expect(sent).toContain('startingArmbandNumber');
    expect(sent).not.toContain('allowNonOwnerHandlers');
  });

  it('gives every excluded key a reason', () => {
    for (const field of Object.values(SHOW_UPDATE_FIELDS)) {
      if ('excluded' in field) expect(field.excluded.length).toBeGreaterThan(10);
    }
  });
});
