import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { buildEntryListTools } from '@/components/entries/management/entryManagementViews';
import { findHeldEntries, findRunOutOffers } from '@/features/waiting-for-you';
import type { RunOutOfferEntry } from '@/features/waiting-for-you';
import { summarizeWaitlistWaiting } from '@/features/waiting-for-you/waitlistWaiting';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type { Dog } from '@/types/dog-types';
import type { ShowMapTree } from '../showMapTypes';
import { buildSecretaryCockpitSnapshot } from '../cockpit/buildSecretaryCockpitSnapshot';
import { CockpitAttentionStrip } from '../cockpit/CockpitAttentionStrip';
import { computeShowDeskPendingSignals } from '../showDeskPendingSignals';
import type { ShowDeskWaitingInput } from '../showDeskWaitingSignals';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

const tree = { nodesById: {}, rootIds: [], diagnostics: [] } as unknown as ShowMapTree;

function entry(
  id: string,
  over: Partial<EntryManagementEntry> = {},
  held = false
): EntryManagementEntry {
  return {
    id,
    registrationId: `reg-${id}`,
    entryNumber: id,
    showId: 'show-1',
    dogId: `dog-${id}`,
    dogName: id,
    ownerName: 'Owner',
    ownerEmail: '',
    handlerName: 'Handler',
    classes: [
      { id, classId: 'c1', name: 'Novice', number: '1', fee: 25, status: 'entered', trialId: 't1' },
    ],
    totalFee: 25,
    paidAmount: 25,
    entryStatus: EntryStatus.ACCEPTED,
    rawEntryStatus: 'confirmed',
    rawPaymentStatus: 'paid',
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date(2026, 6, 1),
    lastUpdated: new Date(2026, 6, 1),
    awaitingRegistrationNumber: held,
    ...over,
  };
}

const entries = [entry('running', {}, true), entry('running-2', {}, true)];

const wl = (id: string, over: Partial<RunOutOfferEntry> = {}): RunOutOfferEntry => ({
  id,
  classId: 'c2',
  status: 'expired',
  offeredAt: '2026-11-01',
  ...over,
});

/** Two offers ran out in Interior Advanced; one more was refilled, one dog is simply waiting. */
const waitlistRows: RunOutOfferEntry[] = [
  wl('x1'),
  wl('x2', { offeredAt: '2026-11-02' }),
  wl('x3', { refilledByOfferId: 'x9' }),
  wl('w1', { classId: 'c1', status: 'waiting', offeredAt: undefined }),
];
function waitlistWaiting(rows: RunOutOfferEntry[] = waitlistRows) {
  return summarizeWaitlistWaiting({
    runOut: findRunOutOffers(rows),
    classNameById: new Map([
      ['c1', 'Container Novice A'],
      ['c2', 'Interior Advanced'],
    ]),
  });
}

const dog = { id: 'dog-running', registrations: [] } as unknown as Dog;
const held = findHeldEntries({ entries, trials: [{ id: 't1', registry_id: 'AKC' }], dogs: [dog] });

function signalsFor(waiting: Partial<ShowDeskWaitingInput>) {
  return computeShowDeskPendingSignals({
    showId: 'show-1',
    tree,
    entries: [],
    waiting: {
      heldEntries: undefined,
      waitlist: null,
      ...waiting,
    },
  });
}
const byId = (signals: ReturnType<typeof signalsFor>, id: string) =>
  signals.find(signal => signal.id === id);

describe('Show Desk waiting pills (MYK9-1949)', () => {
  it('Held pill counts the held entries its list shows', () => {
    const pill = byId(signalsFor({ heldEntries: held.count }), 'entries-held');
    expect(held.count).toBe(2);
    expect(pill?.count).toBe(held.rows.length);
    expect(pill?.label).toBe('2 entries held for a registration number');
    expect(pill?.href).toContain('exception=registration-needed');
  });

  it('Waitlist pill is the run-out offers, equal to the run-out list rows, and names no spot', () => {
    const waiting = waitlistWaiting();
    const pill = byId(signalsFor({ waitlist: waiting }), 'waitlist-waiting');
    expect(pill?.count).toBe(findRunOutOffers(waitlistRows).rows.length);
    expect(pill?.count).toBe(2);
    expect(pill?.label).toBe('2 offers have run out in Interior Advanced');
    expect(pill?.label).not.toMatch(/spot/i);
    expect(pill?.href).toContain('exception=waitlist');
  });

  it('says how many classes when offers ran out in several', () => {
    const waiting = waitlistWaiting([wl('x1'), wl('y1', { classId: 'c1' })]);
    expect(byId(signalsFor({ waitlist: waiting }), 'waitlist-waiting')?.label).toBe(
      '2 offers have run out in 2 classes'
    );
  });

  it('shows no waitlist pill when no offer has run out', () => {
    const waiting = waitlistWaiting([wl('w1', { classId: 'c1', status: 'waiting' })]);
    expect(waiting.count).toBe(0);
    expect(byId(signalsFor({ waitlist: waiting }), 'waitlist-waiting')).toBeUndefined();
  });

  it('shows no pill at zero and none while a count is not known', () => {
    expect(
      signalsFor({
        heldEntries: 0,
        waitlist: { count: 0, runOut: [] },
      })
    ).toEqual([]);
    expect(signalsFor({})).toEqual([]);
  });

  it('the Actions menu carries the same counts as the pills, the Pulls count as the page passes it, and none at zero', () => {
    const waiting = waitlistWaiting();
    const tools = buildEntryListTools('show-1', {
      pulls: 4,
      moveUps: undefined,
      registrationNeeded: held.count,
      waitlist: waiting.count,
    });
    const label = (id: string) => tools.find(tool => tool.id === id)?.attentionLabel;
    expect(label('entry-list-pulls')).toBe('4');
    expect(label('entry-list-registration-needed')).toBe(String(held.count));
    expect(label('entry-list-waitlist')).toBe(String(waiting.count));

    const empty = buildEntryListTools('show-1', {
      pulls: 0,
      moveUps: 0,
      registrationNeeded: 0,
      waitlist: 0,
    });
    expect(empty.every(tool => tool.attentionLabel === undefined)).toBe(true);
  });

  it('renders each pill in the Needs attention strip as a link to its list', () => {
    const pendingSignals = signalsFor({
      heldEntries: 2,
      waitlist: waitlistWaiting(),
    });
    const snapshot = buildSecretaryCockpitSnapshot({
      showId: 'show-1',
      trials: [],
      classes: [],
      tree,
      pendingSignals,
      returnTo: '/shows/show-1',
      now: new Date('2026-11-16T15:00:00.000Z'),
    });
    const attention = snapshot.administrativeAttention ?? [];
    render(
      <CockpitAttentionStrip
        items={attention}
        all={attention}
        overflowCount={0}
        classNameById={new Map()}
        onCommand={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /needs attention · 2/i })).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: '2 entries held for a registration number, opens Registration number needed',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: '2 offers have run out in Interior Advanced, opens Waitlist',
      })
    ).toHaveAttribute('href', expect.stringContaining('exception=waitlist'));
  });
});
