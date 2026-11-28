import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  trials: vi.fn(),
  show: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: Object.assign(mocks.toast, { success: mocks.success, error: mocks.error }),
}));
vi.mock('@/services/replication', () => ({
  replicatedTrialsTable: { getTrialsByShow: mocks.trials },
  replicatedShowsTable: { get: mocks.show },
}));

import { entryCloseOffer, offerEntryCloseAfterTrialMove } from '../entryCloseOffer';

describe('entryCloseOffer', () => {
  it('offers the day before the new start when the show now starts before entries close', () => {
    expect(entryCloseOffer('2026-11-11', '2026-12-10T00:00:00+00:00')).toEqual({
      closeOn: '2026-11-10',
      canClose: true,
    });
  });
  it('offers nothing when entries still close before the start', () => {
    expect(entryCloseOffer('2026-12-12', '2026-12-10')).toBeNull();
  });
  it('offers nothing when entries close on the start day (the form allows it)', () => {
    expect(entryCloseOffer('2026-12-10', '2026-12-10')).toBeNull();
  });
  it('offers one day earlier when entries close the day after the start', () => {
    expect(entryCloseOffer('2026-12-10', '2026-12-11')).toEqual({
      closeOn: '2026-12-09',
      canClose: true,
    });
  });
  it('crosses a month boundary', () => {
    expect(entryCloseOffer('2026-12-01', '2026-12-10')).toEqual({
      closeOn: '2026-11-30',
      canClose: true,
    });
  });
  it('offers nothing without an entry close date or a start', () => {
    expect(entryCloseOffer('2026-11-11', null)).toBeNull();
    expect(entryCloseOffer('2026-11-11', '')).toBeNull();
    expect(entryCloseOffer(undefined, '2026-12-10')).toBeNull();
  });
});

describe('offerEntryCloseAfterTrialMove', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('the action closes entries the day before the new start and says so', async () => {
    mocks.trials.mockResolvedValue([{ date: '2026-11-11' }, { date: '2026-11-12' }]);
    mocks.show.mockResolvedValue({ entryCloseDate: '2026-12-10T00:00:00+00:00' });
    const updateShow = vi.fn().mockResolvedValue({ id: 'show-1' });

    await offerEntryCloseAfterTrialMove('show-1', updateShow);
    const options = mocks.toast.mock.calls[0]?.[1] as { action: { onClick: () => Promise<void> } };
    await options.action.onClick();

    expect(updateShow).toHaveBeenCalledWith('show-1', { entryCloseDate: '2026-11-10' });
    expect(mocks.success).toHaveBeenCalledWith('Entries now close on Tue, Nov 10.');
  });

  it('shows nothing when entries already close before the start', async () => {
    mocks.trials.mockResolvedValue([{ date: '2026-12-12' }]);
    mocks.show.mockResolvedValue({ entryCloseDate: '2026-12-10' });
    await offerEntryCloseAfterTrialMove('show-1', vi.fn());
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('says the change could not be saved when the update fails', async () => {
    mocks.trials.mockResolvedValue([{ date: '2026-11-11' }]);
    mocks.show.mockResolvedValue({ entryCloseDate: '2026-12-10' });
    await offerEntryCloseAfterTrialMove('show-1', vi.fn().mockRejectedValue(new Error('x')));
    const options = mocks.toast.mock.calls[0]?.[1] as { action: { onClick: () => Promise<void> } };
    await options.action.onClick();
    expect(mocks.error).toHaveBeenCalledWith('Entry close could not be changed. Try again.');
  });

  it('treats a null update result (show not found locally) as a failure', async () => {
    mocks.trials.mockResolvedValue([{ date: '2026-11-11' }]);
    mocks.show.mockResolvedValue({ entryCloseDate: '2026-12-10' });
    await offerEntryCloseAfterTrialMove('show-1', vi.fn().mockResolvedValue(null));
    const options = mocks.toast.mock.calls[0]?.[1] as { action: { onClick: () => Promise<void> } };
    await options.action.onClick();
    expect(mocks.error).toHaveBeenCalledWith('Entry close could not be changed. Try again.');
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('drops the action and points to Edit Show when the day before the start is before entries open', async () => {
    mocks.trials.mockResolvedValue([{ date: '2026-11-11' }]);
    mocks.show.mockResolvedValue({
      entryOpenDate: '2026-11-11',
      entryCloseDate: '2026-12-10',
    });
    await offerEntryCloseAfterTrialMove('show-1', vi.fn());
    const options = mocks.toast.mock.calls[0]?.[1] as { action?: unknown; description: string };
    expect(options.action).toBeUndefined();
    expect(options.description).toContain('Change the entry period in Edit Show.');
  });

  it('keeps the action when entries open exactly the day before the start (same-day window is valid)', async () => {
    mocks.trials.mockResolvedValue([{ date: '2026-11-11' }]);
    mocks.show.mockResolvedValue({
      entryOpenDate: '2026-11-10T00:00:00+00:00',
      entryCloseDate: '2026-12-10',
    });
    await offerEntryCloseAfterTrialMove('show-1', vi.fn());
    const options = mocks.toast.mock.calls[0]?.[1] as { action?: unknown };
    expect(options.action).toBeDefined();
  });
});

describe('entryCloseOffer open day', () => {
  it('cannot close when the day before the start is before the open day', () => {
    expect(entryCloseOffer('2026-11-11', '2026-12-10', '2026-11-11')).toEqual({
      closeOn: '2026-11-10',
      canClose: false,
    });
  });
  it('can close when the day before the start equals the open day', () => {
    expect(entryCloseOffer('2026-11-11', '2026-12-10', '2026-11-10')?.canClose).toBe(true);
  });
});
