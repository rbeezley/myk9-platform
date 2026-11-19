import { describe, expect, it } from 'vitest';
import {
  PUBLISH_BLOCKER_KEYS,
  computeWizardPublishBlockers,
  parsePublishBlockers,
  publishBlockerSentence,
  publishBlockerWaitingText,
} from '../publishBlockers';

const club = (key: string, waitingOn: string | null, eta: string | null) => ({
  key,
  waitingOn,
  eta,
});

describe('parsePublishBlockers', () => {
  it('reads the server array, keeping order and nulls', () => {
    expect(
      parsePublishBlockers([
        { key: 'club_not_approved', waiting_on: 'myk9', eta: 'about a day' },
        { key: 'payouts_not_enabled', waiting_on: 'club_admin', eta: null },
        { key: 'online_entries_off', waiting_on: null, eta: null },
      ])
    ).toEqual([
      { key: 'club_not_approved', waitingOn: 'myk9', eta: 'about a day' },
      { key: 'payouts_not_enabled', waitingOn: 'club_admin', eta: null },
      { key: 'online_entries_off', waitingOn: null, eta: null },
    ]);
  });

  it('rejects a response that is not a list of keyed lines', () => {
    expect(() => parsePublishBlockers(null)).toThrow();
    expect(() => parsePublishBlockers([{ waiting_on: 'myk9' }])).toThrow();
  });
});

describe('wording', () => {
  it('has a plain sentence for each of the six keys and none with an em dash', () => {
    expect(PUBLISH_BLOCKER_KEYS).toHaveLength(6);
    for (const key of PUBLISH_BLOCKER_KEYS) {
      const sentence = publishBlockerSentence(club(key, 'secretary', null));
      expect(sentence.length).toBeGreaterThan(10);
      expect(sentence).not.toContain('—');
    }
    expect(publishBlockerSentence(club('payouts_not_enabled', 'stripe', 'a day or two'))).toMatch(
      /Stripe is reviewing/
    );
  });

  it('says who a line waits on and roughly how long, only when it is not the viewer’s job', () => {
    expect(publishBlockerWaitingText(club('club_not_approved', 'myk9', 'about a day'), false)).toBe(
      'Waiting on myK9Show, usually about a day'
    );
    expect(publishBlockerWaitingText(club('payouts_not_enabled', 'stripe', null), false)).toBe(
      'Waiting on Stripe'
    );
    expect(publishBlockerWaitingText(club('payouts_not_enabled', 'club_admin', null), false)).toBe(
      'Waiting on your club admin'
    );
    expect(
      publishBlockerWaitingText(club('payouts_not_enabled', 'club_admin', null), true)
    ).toBeNull();
    expect(
      publishBlockerWaitingText(club('premium_not_published', 'secretary', null), false)
    ).toBeNull();
    expect(publishBlockerWaitingText(club('online_entries_off', null, null), false)).toBeNull();
  });
});

describe('computeWizardPublishBlockers mirrors the server keys', () => {
  const OPEN = '2026-06-01T12:00:00.000Z';
  const CLOSE = '2026-06-25T12:00:00.000Z';
  const keys = (input: Parameters<typeof computeWizardPublishBlockers>[0]) =>
    computeWizardPublishBlockers(input).map(b => b.key);

  it('always lists the premium for a new show', () => {
    expect(keys({ clubBlockers: [], entryOpenDate: OPEN, entryCloseDate: CLOSE })).toEqual([
      'premium_not_published',
    ]);
  });

  it('lists the club lines first, as the club RPC returned them', () => {
    expect(
      keys({
        clubBlockers: [
          club('club_not_approved', 'myk9', 'about a day'),
          club('payouts_not_enabled', 'club_admin', null),
        ],
        entryOpenDate: OPEN,
        entryCloseDate: CLOSE,
      })
    ).toEqual(['club_not_approved', 'payouts_not_enabled', 'premium_not_published']);
  });

  it('lists entry_dates_missing and entry_dates_out_of_order', () => {
    expect(keys({ clubBlockers: [], entryOpenDate: '', entryCloseDate: null })).toEqual([
      'premium_not_published',
      'entry_dates_missing',
    ]);
    expect(keys({ clubBlockers: [], entryOpenDate: CLOSE, entryCloseDate: OPEN })).toEqual([
      'premium_not_published',
      'entry_dates_out_of_order',
    ]);
  });

  it('lists online_entries_off between payouts and premium when entries are off', () => {
    expect(
      keys({
        clubBlockers: [club('payouts_not_enabled', 'club_admin', null)],
        onlineEntriesEnabled: false,
        entryOpenDate: OPEN,
        entryCloseDate: CLOSE,
      })
    ).toEqual(['payouts_not_enabled', 'online_entries_off', 'premium_not_published']);
  });
});
