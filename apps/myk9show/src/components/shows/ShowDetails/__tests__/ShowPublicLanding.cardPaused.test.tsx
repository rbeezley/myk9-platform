import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCountdown } from '@/features/_shared/hooks/useCountdown';
import { usePendingEntryCopy } from '@/features/_shared/landing/PendingEntryCopyContext';
import { ShowPublicLanding } from '../ShowPublicLanding';
import type { Show } from '@/types/show-types';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/supabase')>();
  return {
    ...original,
    supabase: Object.assign(
      Object.create(Object.getPrototypeOf(original.supabase)),
      original.supabase,
      { rpc }
    ),
  };
});
vi.mock('@/features/payments/ServiceFeeNote', () => ({
  useServiceFeeLabel: () => '7%',
  ServiceFeeNote: () => <span>Plus a 7% service fee when you pay online.</span>,
}));
vi.mock('@/features/heritage/landing/HeritageLandingPage', () => ({
  HeritageLandingPage: ({
    entryPendingReason,
    show,
  }: {
    entryPendingReason?: string;
    show: { entryCloseDate?: string };
  }) => {
    const copy = usePendingEntryCopy();
    // The real landings gate Enter on the same countdown and the pending reason.
    const closed = useCountdown(show.entryCloseDate ?? null, 'America/New_York').closed;
    return (
      <div>
        {!closed && !entryPendingReason && <button type="button">Enter</button>}
        <span data-testid="reason">{entryPendingReason ?? 'enter-open'}</span>
        <span data-testid="copy">{copy.sentence}</span>
      </div>
    );
  },
}));

function openShow(takesCheck: boolean): Show {
  return {
    id: 'show-1',
    name: 'Test Show',
    style: 'heritage',
    status: 'published',
    onlineEntriesEnabled: true,
    acceptCheckPayments: takesCheck,
    acceptCashPayments: false,
    entryOpenDate: '2000-01-01T00:00:00+00:00',
    entryCloseDate: '2099-01-01T00:00:00+00:00',
  } as unknown as Show;
}

const renderLanding = (show: Show) =>
  render(
    <ShowPublicLanding
      show={show}
      landingTrials={[]}
      hasEntryClassInventory
      entryPendingReason={undefined}
    />
  );

describe('ShowPublicLanding card entries (MYK9-2192)', () => {
  beforeEach(() => {
    rpc.mockReset();
  }, 30_000);

  it('withholds Enter while the answer loads', () => {
    rpc.mockReturnValue(new Promise(() => undefined));
    renderLanding(openShow(false));
    expect(screen.getByTestId('reason')).toHaveTextContent('card_entries_checking');
  });

  it('says card entries are paused for a card-only show and withholds Enter', async () => {
    rpc.mockResolvedValue({ data: ['show-1'], error: null });
    renderLanding(openShow(false));
    expect(
      await screen.findByText('Card entries are paused. Contact the secretary.')
    ).toBeInTheDocument();
    expect(screen.getByTestId('reason')).toHaveTextContent('card_entries_paused');
  });

  it('keeps Enter and adds one line for a paused show that takes check', async () => {
    rpc.mockResolvedValue({ data: ['show-1'], error: null });
    renderLanding(openShow(true));
    expect(
      await screen.findByText('Card payments are paused. Pay by check or cash.')
    ).toBeInTheDocument();
    expect(screen.getByTestId('reason')).toHaveTextContent('enter-open');
  });

  it('offers Enter with no notice when card entries are open', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    renderLanding(openShow(false));
    expect(await screen.findByText('enter-open')).toBeInTheDocument();
    expect(screen.queryByRole('note', { name: 'Card payments paused' })).not.toBeInTheDocument();
  });

  it('does not ask about card entries for a show with no classes yet', () => {
    rpc.mockResolvedValue({ data: ['show-1'], error: null });
    render(
      <ShowPublicLanding
        show={openShow(true)}
        landingTrials={[]}
        hasEntryClassInventory={false}
        entryPendingReason={undefined}
      />
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.queryByRole('note', { name: 'Card payments paused' })).not.toBeInTheDocument();
  });

  it('asks, and withholds Enter, when the inventory is unresolved even if the row lists no classes', () => {
    rpc.mockReturnValue(new Promise(() => undefined));
    const show = { ...openShow(true), trials: [{ id: 't1', classes: [] }] } as unknown as Show;
    render(
      <ShowPublicLanding
        show={show}
        landingTrials={[]}
        hasEntryClassInventory={null}
        entryPendingReason={undefined}
      />
    );
    expect(rpc).toHaveBeenCalled();
    expect(screen.getByTestId('reason')).toHaveTextContent('card_entries_checking');
  });

  it('shows the online service fee note when card entries are open', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    renderLanding(openShow(true));
    await screen.findByText('enter-open');
    expect(screen.getByText(/service fee when you pay online/)).toBeInTheDocument();
  });

  describe('a timed close (12:00 UTC)', () => {
    const timed = (): Show =>
      ({ ...openShow(true), entryCloseDate: '2026-06-10T12:00:00+00:00' }) as Show;

    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows no card note and no Enter just after the close', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-06-10T12:00:01Z'));
      rpc.mockResolvedValue({ data: ['show-1'], error: null });
      renderLanding(timed());
      expect(rpc).not.toHaveBeenCalled();
      expect(screen.queryByRole('note', { name: 'Card payments paused' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Enter' })).not.toBeInTheDocument();
    });

    it('behaves as open just before the close', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-06-10T11:59:00Z'));
      rpc.mockResolvedValue({ data: ['show-1'], error: null });
      renderLanding(timed());
      expect(
        await screen.findByText('Card payments are paused. Pay by check or cash.')
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Enter' })).toBeInTheDocument();
    });
  });

  it('withholds Enter when the request fails', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('x') });
    renderLanding(openShow(true));
    expect(await screen.findByText('online_setting_unknown')).toBeInTheDocument();
  });
});
