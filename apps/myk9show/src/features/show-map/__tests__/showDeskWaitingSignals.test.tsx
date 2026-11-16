import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { buildEntryListTools } from '@/components/entries/management/entryManagementViews';
import {
  findHeldEntries,
  findOpenWaitlistSpots,
  findRunOutOffers,
  type WaitlistSpotClass,
  type WaitlistSpotEntry,
} from '@/features/waiting-for-you';
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

const cls = (over: Partial<WaitlistSpotClass> = {}): WaitlistSpotClass => ({
  id: 'c1',
  name: 'Container Novice A',
  maxEntries: null,
  seatHoldingCount: 5,
  ...over,
});
const wl = (id: string, over: Partial<WaitlistSpotEntry & { offeredAt: string }> = {}) => ({
  id,
  classId: 'c1',
  dogId: `dog-${id}`,
  status: 'waiting',
  position: 1,
  ...over,
});

function waitlistWaiting(opts: { judgeDays: 'known' | 'unknown'; runOut?: boolean }) {
  const rows = [
    wl('w1'),
    ...(opts.runOut
      ? [wl('x1', { classId: 'c2', status: 'expired', dogId: 'd-x', offeredAt: '2026-11-01' })]
      : []),
  ] as (WaitlistSpotEntry & { offeredAt?: string })[];
  return summarizeWaitlistWaiting({
    spots: findOpenWaitlistSpots({
      classes: [cls(), cls({ id: 'c2', name: 'Interior Advanced' })],
      waitlist: rows,
      judgeDays: opts.judgeDays === 'known' ? [] : null,
    }),
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
    expect(pill?.label).toBe('2 entries held for a registration number.');
    expect(pill?.href).toContain('exception=registration-needed');
  });

  it('Waitlist pill names the class with a spot and the class with a run-out offer', () => {
    const waiting = waitlistWaiting({ judgeDays: 'known', runOut: true });
    const pill = byId(signalsFor({ waitlist: waiting }), 'waitlist-waiting');
    expect(pill?.label).toBe(
      'A spot opened in Container Novice A · 1 offer has run out in Interior Advanced'
    );
    expect(pill?.count).toBe(2);
    expect(pill?.href).toContain('exception=waitlist');
  });

  it('never shows a spot while the judge-day figures are unknown, but still shows a run-out offer', () => {
    const waiting = waitlistWaiting({ judgeDays: 'unknown', runOut: true });
    const pill = byId(signalsFor({ waitlist: waiting }), 'waitlist-waiting');
    expect(pill?.label).toBe('1 offer has run out in Interior Advanced');
    expect(pill?.count).toBe(1);
    expect(
      byId(signalsFor({ waitlist: waitlistWaiting({ judgeDays: 'unknown' }) }), 'waitlist-waiting')
    ).toBeUndefined();
  });

  it('shows no pill at zero and none while a count is not known', () => {
    expect(
      signalsFor({
        heldEntries: 0,
        waitlist: { count: 0, spotClasses: [], runOut: [] },
      })
    ).toEqual([]);
    expect(signalsFor({})).toEqual([]);
  });

  it('the Actions menu carries the same counts as the pills, the Pulls count as the page passes it, and none at zero', () => {
    const waiting = waitlistWaiting({ judgeDays: 'known', runOut: true });
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
      waitlist: waitlistWaiting({ judgeDays: 'known' }),
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
        name: '2 entries held for a registration number., opens Registration number needed',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'A spot opened in Container Novice A, opens Waitlist' })
    ).toHaveAttribute('href', expect.stringContaining('exception=waitlist'));
  });
});
