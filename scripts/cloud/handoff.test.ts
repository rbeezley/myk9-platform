import { describe, expect, it } from 'vitest';
import {
  formatEventComment,
  parseEventComments,
  prepareAppend,
  reconcileHandoff,
  type HandoffEvent,
  type LiveState,
} from './handoff.ts';

import { chain, event, HEAD, NEW_HEAD } from './handoff-fixtures.ts';

const OPEN: LiveState = {
  prState: 'open',
  headSha: HEAD,
  artifacts: {},
  ownerRunActive: undefined,
};

describe('makeEventId', () => {
  it('is stable for the same transition and differs for a different one', () => {
    const a = event();
    expect(event().eventId).toBe(a.eventId);
    expect(event({ phase: 'reviewing' }).eventId).not.toBe(a.eventId);
  });

  it('covers nested evidence, so a swapped artifact digest changes the id', () => {
    const pointer = {
      kind: 'artifact' as const,
      runId: '9',
      attempt: 1,
      name: 'r',
      digest: 'sha256:1',
    };
    expect(event({ evidence: [pointer] }).eventId).not.toBe(
      event({ evidence: [{ ...pointer, digest: 'sha256:2' }] }).eventId
    );
  });
});

describe('comment round trip', () => {
  it('parses an event back from a trusted comment', () => {
    const original = event();
    const parsed = parseEventComments([
      { body: formatEventComment(original), authorAssociation: 'OWNER' },
    ]);
    expect(parsed.events).toEqual([original]);
    expect(parsed.rejected).toBe(0);
  });

  it('ignores events from authors outside the trusted associations on a public repo', () => {
    const parsed = parseEventComments([
      { body: formatEventComment(event()), authorAssociation: 'NONE' },
      { body: formatEventComment(event()), authorAssociation: 'CONTRIBUTOR' },
    ]);
    expect(parsed.events).toEqual([]);
    expect(parsed.rejected).toBe(2);
  });

  it('rejects a marked comment whose JSON is malformed or incomplete', () => {
    const good = formatEventComment(event());
    const parsed = parseEventComments([
      { body: good.replace('"headSha"', '"headShaX"'), authorAssociation: 'OWNER' },
      {
        body: good.replace(/```json[\s\S]*```/, '```json\n{oops\n```'),
        authorAssociation: 'OWNER',
      },
      { body: 'an ordinary comment', authorAssociation: 'OWNER' },
    ]);
    expect(parsed.events).toEqual([]);
    expect(parsed.rejected).toBe(2);
  });

  it('rejects an event whose id does not match its content', () => {
    const tampered = { ...event(), result: 'clean' as const };
    const parsed = parseEventComments([
      { body: formatEventComment(tampered), authorAssociation: 'OWNER' },
    ]);
    expect(parsed.events).toEqual([]);
    expect(parsed.rejected).toBe(1);
  });
});

describe('prepareAppend', () => {
  it('appends a child of the latest event', () => {
    const events = chain({});
    const next = event({ parentEventId: events[0]!.eventId, phase: 'reviewing' });
    expect(prepareAppend(events, next)).toEqual({ kind: 'append', event: next });
  });

  it('treats a re-sent event as a duplicate and does not mutate', () => {
    const events = chain({}, { phase: 'reviewing' });
    expect(prepareAppend(events, events[1]!)).toEqual({ kind: 'duplicate' });
  });

  it('refuses an event written from a stale snapshot', () => {
    const events = chain({}, { phase: 'reviewing' });
    const stale = event({ parentEventId: events[0]!.eventId, phase: 'needs-human' });
    const outcome = prepareAppend(events, stale);
    expect(outcome.kind).toBe('stale');
  });

  it('refuses a second root once a ledger exists', () => {
    const events = chain({});
    expect(prepareAppend(events, event({ phase: 'reviewing' })).kind).toBe('stale');
  });
});

describe('reconcileHandoff', () => {
  it('needs a human when nothing was recorded', () => {
    expect(reconcileHandoff([], OPEN).decision).toBe('needs-human');
  });

  it('reconstructs the next action after temp folders and agent context are gone', () => {
    const events = chain(
      {},
      {
        phase: 'implemented',
        result: 'pending',
        nextAction: 'mark the PR ready for review',
      }
    );
    const result = reconcileHandoff(events, OPEN);
    expect(result).toMatchObject({
      decision: 'continue',
      latestEventId: events[1]!.eventId,
      nextAction: 'mark the PR ready for review',
      cleanEvidence: false,
    });
  });

  it('collapses duplicate deliveries of the same event', () => {
    const events = chain({}, { phase: 'implemented' });
    const result = reconcileHandoff([...events, events[1]!, events[0]!], OPEN);
    expect(result.decision).toBe('continue');
    expect(result.latestEventId).toBe(events[1]!.eventId);
  });

  it('needs a human when two writers forked the ledger', () => {
    const events = chain({});
    const left = event({ parentEventId: events[0]!.eventId, phase: 'reviewing' });
    const right = event({ parentEventId: events[0]!.eventId, phase: 'needs-human' });
    const result = reconcileHandoff([...events, left, right], OPEN);
    expect(result.decision).toBe('needs-human');
    expect(result.reason).toMatch(/fork/);
  });

  it('reports clean evidence only for the current head with its artifact available', () => {
    const events = chain(
      {},
      {
        phase: 'reviewed',
        result: 'clean',
        evidence: [
          { kind: 'artifact', runId: '91', attempt: 1, name: 'review', digest: 'sha256:1' },
        ],
        nextAction: 'wait for owner merge authorization',
      }
    );
    const live = { ...OPEN, artifacts: { 'review@91.1': 'available' as const } };
    expect(reconcileHandoff(events, live)).toMatchObject({
      decision: 'continue',
      cleanEvidence: true,
    });
  });

  it('never reuses a clean verdict after the head moved', () => {
    const events = chain({}, { phase: 'reviewed', result: 'clean' });
    const result = reconcileHandoff(events, { ...OPEN, headSha: NEW_HEAD });
    expect(result.cleanEvidence).toBe(false);
    expect(result.decision).toBe('continue');
    expect(result.nextAction).toMatch(new RegExp(`review the current head ${NEW_HEAD}`));
  });

  it.each(['expired', 'missing'] as const)(
    'treats a %s artifact as evidence unavailable, never clean',
    state => {
      const events = chain(
        {},
        {
          phase: 'reviewed',
          result: 'clean',
          evidence: [
            { kind: 'artifact', runId: '91', attempt: 1, name: 'review', digest: 'sha256:1' },
          ],
        }
      );
      const live = { ...OPEN, artifacts: { 'review@91.1': state } };
      const result = reconcileHandoff(events, live);
      expect(result.cleanEvidence).toBe(false);
      expect(result.nextAction).toMatch(/replacement review attempt/);
    }
  );

  it('waits while a recorded owner may still be running, and continues once it has ended', () => {
    const events = chain({}, { phase: 'reviewing', runId: 'run-2' });
    expect(reconcileHandoff(events, OPEN).decision).toBe('wait');
    expect(reconcileHandoff(events, { ...OPEN, ownerRunActive: true }).decision).toBe('wait');
    const ended = reconcileHandoff(events, { ...OPEN, ownerRunActive: false });
    expect(ended.decision).toBe('continue');
    expect(ended.nextAction).toMatch(/incomplete/);
  });

  it('needs a human when the PR closed unmerged or the ledger asked for one', () => {
    const events = chain({});
    expect(reconcileHandoff(events, { ...OPEN, prState: 'closed' }).decision).toBe('needs-human');
    expect(reconcileHandoff(chain({}, { phase: 'needs-human' }), OPEN).decision).toBe(
      'needs-human'
    );
  });

  it('is complete only once a merged PR has recorded its close-out', () => {
    const merged = { ...OPEN, prState: 'merged' as const };
    expect(reconcileHandoff(chain({}, { phase: 'reviewed' }), merged)).toMatchObject({
      decision: 'continue',
      nextAction: expect.stringMatching(/close-out/),
    });
    expect(reconcileHandoff(chain({}, { phase: 'closed-out' }), merged).decision).toBe('complete');
  });

  it('never carries authorization', () => {
    const result = reconcileHandoff(chain({}, { phase: 'reviewed', result: 'clean' }), OPEN);
    expect(Object.keys(result)).not.toContain('authorized');
  });
});
