// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  buildResultsPushPayload,
  groupResultsRecipients,
  parseLease,
  parseResultsPushPayload,
  runResultsPush,
  type ResultsPushDeps,
  type ResultsPushLease,
  type ScoredEntryAudienceRow,
} from './resultsPush';

// MYK9-737: the push is class-level, and the pending row is marked sent only
// after the sends succeeded (the Codex P1: a sent claim written before
// delivery lost the push forever when the send failed).

const TARGET = { classId: 'class-1', className: 'Novice Interior' };

const TWO_EXHIBITORS: ScoredEntryAudienceRow[] = [
  { dog: { call_name: 'Rex', owner: { auth_user_id: 'u1' } }, handler: null },
  { dog: { call_name: 'Fido', owner: { auth_user_id: 'u2' } }, handler: null },
];

type Call =
  | ['begin', string]
  | ['send', string]
  | ['finish', string, string, 'sent' | 'error', string[], string | null];

/** A fake of the four IO edges that records every call, in order. */
function fakeDeps(opts: {
  lease?: ResultsPushLease;
  entries?: ScoredEntryAudienceRow[] | Error;
  failFor?: string[];
  throwFor?: string[];
}) {
  const calls: Call[] = [];
  const deps: ResultsPushDeps = {
    async begin(classId) {
      calls.push(['begin', classId]);
      return opts.lease ?? { outcome: 'leased', claimToken: 'tok-1', deliveredTo: [] };
    },
    async readScoredEntries() {
      if (opts.entries instanceof Error) throw opts.entries;
      return opts.entries ?? TWO_EXHIBITORS;
    },
    async sendPush(userId) {
      calls.push(['send', userId]);
      if (opts.throwFor?.includes(userId)) throw new Error('network down');
      return !opts.failFor?.includes(userId);
    },
    async finish(classId, token, outcome, delivered, error) {
      calls.push(['finish', classId, token, outcome, delivered, error]);
    },
  };
  return { deps, calls };
}

describe('runResultsPush', () => {
  it('marks the class sent after every recipient was sent', async () => {
    const { deps, calls } = fakeDeps({});

    await expect(runResultsPush(deps, TARGET)).resolves.toEqual({
      status: 'push_sent',
      recipients: 2,
    });

    expect(calls).toEqual([
      ['begin', 'class-1'],
      ['send', 'u1'],
      ['send', 'u2'],
      ['finish', 'class-1', 'tok-1', 'sent', ['u1', 'u2'], null],
    ]);
  });

  it('leaves the class pending with last_error when the provider call fails, never marking it sent', async () => {
    const { deps, calls } = fakeDeps({ failFor: ['u2'] });

    await expect(runResultsPush(deps, TARGET)).resolves.toEqual({
      status: 'push_failed',
      failed: 1,
      recipients: 2,
      error: '1/2 recipients failed',
    });

    const finishes = calls.filter(call => call[0] === 'finish');
    expect(finishes).toEqual([
      ['finish', 'class-1', 'tok-1', 'error', ['u1'], '1/2 recipients failed'],
    ]);
  });

  it('treats a thrown send as a failure too', async () => {
    const { deps, calls } = fakeDeps({ throwFor: ['u1', 'u2'] });

    const result = await runResultsPush(deps, TARGET);

    expect(result.status).toBe('push_failed');
    expect(calls.filter(call => call[0] === 'finish')).toEqual([
      ['finish', 'class-1', 'tok-1', 'error', [], '2/2 recipients failed'],
    ]);
  });

  it('records an audience-query failure as an error without sending', async () => {
    const { deps, calls } = fakeDeps({ entries: new Error('timeout') });

    const result = await runResultsPush(deps, TARGET);

    expect(result.status).toBe('push_failed');
    expect(calls).toEqual([
      ['begin', 'class-1'],
      ['finish', 'class-1', 'tok-1', 'error', [], 'audience resolution failed: timeout'],
    ]);
  });

  it('sends nothing when the class is already sent, failed, or leased by another post', async () => {
    const { deps, calls } = fakeDeps({ lease: { outcome: 'none' } });

    await expect(runResultsPush(deps, TARGET)).resolves.toEqual({ status: 'not_pending' });
    expect(calls).toEqual([['begin', 'class-1']]);
  });

  it('sends nothing when the class is held again (begin deleted the row)', async () => {
    const { deps, calls } = fakeDeps({ lease: { outcome: 'held' } });

    await expect(runResultsPush(deps, TARGET)).resolves.toEqual({ status: 'results_held' });
    expect(calls).toEqual([['begin', 'class-1']]);
  });

  it('marks the class sent when it has no one to notify', async () => {
    const { deps, calls } = fakeDeps({ entries: [] });

    await expect(runResultsPush(deps, TARGET)).resolves.toEqual({ status: 'no_users_to_notify' });
    expect(calls).toEqual([
      ['begin', 'class-1'],
      ['finish', 'class-1', 'tok-1', 'sent', [], null],
    ]);
  });

  it('on a retry, skips recipients already reached and sends only to the rest', async () => {
    const { deps, calls } = fakeDeps({
      lease: { outcome: 'leased', claimToken: 'tok-2', deliveredTo: ['u1'] },
    });

    await expect(runResultsPush(deps, TARGET)).resolves.toEqual({
      status: 'push_sent',
      recipients: 1,
    });
    expect(calls).toEqual([
      ['begin', 'class-1'],
      ['send', 'u2'],
      ['finish', 'class-1', 'tok-2', 'sent', ['u2'], null],
    ]);
  });

  it('marks sent without sending when a retry finds everyone already reached', async () => {
    const { deps, calls } = fakeDeps({
      lease: { outcome: 'leased', claimToken: 'tok-3', deliveredTo: ['u1', 'u2'] },
    });

    await expect(runResultsPush(deps, TARGET)).resolves.toEqual({
      status: 'push_sent',
      recipients: 0,
    });
    expect(calls).toEqual([
      ['begin', 'class-1'],
      ['finish', 'class-1', 'tok-3', 'sent', [], null],
    ]);
  });
});

describe('parseLease (begin_class_results_push rows)', () => {
  it('reads a lease', () => {
    expect(parseLease([{ outcome: 'leased', claim_token: 'tok', delivered_to: ['u1'] }])).toEqual({
      outcome: 'leased',
      claimToken: 'tok',
      deliveredTo: ['u1'],
    });
  });

  it('reads held', () => {
    expect(parseLease([{ outcome: 'held', claim_token: null, delivered_to: null }])).toEqual({
      outcome: 'held',
    });
  });

  it.each([[null], [[]], [{}], [[{ outcome: 'leased' }]], [[{ outcome: 'x', claim_token: 't' }]]])(
    'sends nothing on an unexpected RPC shape: %j',
    rows => {
      expect(parseLease(rows)).toEqual({ outcome: 'none' });
    }
  );
});

describe('parseResultsPushPayload', () => {
  it('reads the class id and name the classes trigger sends', () => {
    expect(
      parseResultsPushPayload({
        type: 'UPDATE',
        table: 'classes',
        record: { id: 'class-1', name: 'Novice Interior' },
      })
    ).toEqual({ classId: 'class-1', className: 'Novice Interior' });
  });

  it.each([
    [{ type: 'UPDATE', table: 'entries', record: { id: 'entry-1' } }],
    [{ type: 'UPDATE', table: 'classes', record: {} }],
    [{}],
    [null],
  ])('rejects anything that is not a class payload: %j', payload => {
    expect(parseResultsPushPayload(payload)).toBeNull();
  });
});

describe('groupResultsRecipients', () => {
  it('notifies each exhibitor once per class, naming all of their scored dogs', () => {
    const recipients = groupResultsRecipients([
      {
        dog: {
          call_name: 'Rex',
          owner: { auth_user_id: 'owner-1' },
          co_owner: { auth_user_id: 'co-1' },
        },
        handler: { auth_user_id: 'owner-1' },
      },
      {
        dog: { call_name: 'Fido', owner: { auth_user_id: 'owner-1' }, co_owner: null },
        handler: { auth_user_id: 'handler-2' },
      },
      { dog: { call_name: 'Ghost', owner: { auth_user_id: null }, co_owner: null }, handler: null },
    ]);

    expect(Object.fromEntries(recipients)).toEqual({
      'owner-1': ['Rex', 'Fido'],
      'co-1': ['Rex'],
      'handler-2': ['Fido'],
    });
  });

  it('falls back to "Your dog" and never lists a dog twice for one person', () => {
    const recipients = groupResultsRecipients([
      { dog: { call_name: null, owner: { auth_user_id: 'u1' } }, handler: { auth_user_id: 'u1' } },
    ]);

    expect(recipients.get('u1')).toEqual(['Your dog']);
  });
});

describe('buildResultsPushPayload', () => {
  it('names the dogs and the class', () => {
    expect(buildResultsPushPayload(['Rex', 'Fido'], 'Novice Interior')).toEqual({
      type: 'results_posted',
      title: 'Results Posted',
      body: 'Rex, Fido — Novice Interior',
      priority: 'normal',
    });
  });

  it('falls back to "a class" when the class has no name', () => {
    expect(buildResultsPushPayload(['Rex'], null).body).toBe('Rex — a class');
  });
});
