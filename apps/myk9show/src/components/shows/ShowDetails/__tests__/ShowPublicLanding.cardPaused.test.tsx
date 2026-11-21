import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  HeritageLandingPage: ({ entryPendingReason }: { entryPendingReason?: string }) => {
    const copy = usePendingEntryCopy();
    return (
      <div>
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

  it('hides the online service fee note while card entries are paused, card-only or not', async () => {
    rpc.mockResolvedValue({ data: ['show-1'], error: null });
    const first = renderLanding(openShow(false));
    await screen.findByText('Card entries are paused. Contact the secretary.');
    expect(screen.queryByText(/service fee when you pay online/)).not.toBeInTheDocument();
    first.unmount();
    renderLanding(openShow(true));
    await screen.findByText('Card payments are paused. Pay by check or cash.');
    expect(screen.queryByText(/service fee when you pay online/)).not.toBeInTheDocument();
  });

  it('keeps the online service fee note when card entries are open', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    renderLanding(openShow(true));
    await screen.findByText('enter-open');
    expect(screen.getByText(/service fee when you pay online/)).toBeInTheDocument();
  });

  it('withholds Enter when the request fails', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('x') });
    renderLanding(openShow(true));
    expect(await screen.findByText('online_setting_unknown')).toBeInTheDocument();
  });
});
