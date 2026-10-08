import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { NetworkStatusContext } from '@/hooks/useNetworkStatus';
import { judgeDayCapacityKey } from '@/hooks/queries/useJudgeDayCapacity';
import { classAvailabilityQueryKey } from '@/hooks/useClassAvailability';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import { render } from '@/test/utils/testUtils';
import { supabase } from '@/services/database/supabaseClient';
import { JudgeCapacityOverview } from '../JudgeCapacityOverview';
import type { JudgeDayCapacity } from '@/types/waitlist-types';
const day: JudgeDayCapacity = {
  judgeId: 'judge-1',
  judgeName: 'Judge One',
  showDate: '2026-10-10',
  capacity: 125,
  confirmedCount: 3,
  waitlistCount: 0,
  mailInReserved: 0,
  availableSpots: 122,
  classIds: ['class-1', 'class-2'],
  classNames: ['Novice', 'Open'],
};
afterEach(() => {
  vi.restoreAllMocks();
});
describe('judge-day capacity editor', () => {
  it('sets the one judge-day with the exact capacity payload, without changing figures early', async () => {
    const rpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: 2, error: null } as never);
    render(
      <JudgeCapacityOverview judgeDays={[day]} onViewWaitList={vi.fn()} capacityShowId="show-1" />
    );
    expect(rpc).not.toHaveBeenCalled();
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Entry limit for Judge One on 2026-10-10' }),
      { target: { value: '50' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save limit' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_judge_day_capacity', {
        p_show_id: 'show-1',
        p_judge_id: 'judge-1',
        p_date: '2026-10-10',
        p_capacity: 50,
      })
    );
    expect(screen.getByText('3 / 125 entries')).toBeInTheDocument();
  });
  it('clears with explicit null and refreshes manager, exhibitor and replica reads', async () => {
    const rpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: 2, error: null } as never);
    const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    const syncTable = vi.fn().mockResolvedValue(undefined);
    render(
      <ReplicationSyncContext.Provider
        value={{
          syncTable,
          triggerSync: vi.fn(),
          status: { isSyncing: false, lastSyncAt: null, error: null, tablesStatus: {} },
        }}
      >
        <JudgeCapacityOverview judgeDays={[day]} onViewWaitList={vi.fn()} capacityShowId="show-1" />
      </ReplicationSyncContext.Provider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use show default' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_judge_day_capacity', {
        p_show_id: 'show-1',
        p_judge_id: 'judge-1',
        p_date: '2026-10-10',
        p_capacity: null,
      })
    );
    await screen.findByText('Entry limit saved.');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: judgeDayCapacityKey('show-1') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: classAvailabilityQueryKey('show-1') });
    expect(syncTable).toHaveBeenCalledWith('judge_assignments');
  });
  it('rejects blank, zero, fractional and integer-overflow drafts before any write', () => {
    const rpc = vi.spyOn(supabase, 'rpc');
    render(
      <JudgeCapacityOverview judgeDays={[day]} onViewWaitList={vi.fn()} capacityShowId="show-1" />
    );
    for (const value of ['', '0', '-2', '2.5', '2147483648']) {
      fireEvent.change(screen.getByRole('spinbutton'), { target: { value } });
      expect(screen.getByRole('button', { name: 'Save limit' })).toBeDisabled();
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it('disables both writes offline', () => {
    const rpc = vi.spyOn(supabase, 'rpc');
    render(
      <NetworkStatusContext.Provider
        value={{
          isOnline: false,
          quality: null,
          showOfflineMessage: true,
          retryConnection: vi.fn(),
        }}
      >
        <JudgeCapacityOverview judgeDays={[day]} onViewWaitList={vi.fn()} capacityShowId="show-1" />
      </NetworkStatusContext.Provider>
    );
    expect(screen.getByRole('button', { name: 'Save limit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Use show default' })).toBeDisabled();
    expect(screen.getByText('Connect to change the entry limit.')).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('keeps entered draft and old figures on refusal, then permits retry', async () => {
    const rpc = vi
      .spyOn(supabase, 'rpc')
      .mockResolvedValueOnce({ data: null, error: { message: 'denied' } } as never)
      .mockResolvedValueOnce({ data: 2, error: null } as never);
    render(
      <JudgeCapacityOverview judgeDays={[day]} onViewWaitList={vi.fn()} capacityShowId="show-1" />
    );
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limit' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('spinbutton')).toHaveValue(50);
    expect(screen.getByText('3 / 125 entries')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save limit' }));
    await screen.findByText('Entry limit saved.');
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it('keeps authoritative figures while pending and does not submit twice', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    vi.spyOn(supabase, 'rpc').mockImplementation(
      () =>
        new Promise(r => {
          resolve = r;
        }) as never
    );
    render(
      <JudgeCapacityOverview judgeDays={[day]} onViewWaitList={vi.fn()} capacityShowId="show-1" />
    );
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limit' }));
    expect(await screen.findByRole('button', { name: 'Saving limit…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Use show default' })).toBeDisabled();
    expect(screen.getByText('3 / 125 entries')).toBeInTheDocument();
    resolve({ data: 2, error: null });
    await screen.findByText('Entry limit saved.');
  });
});
