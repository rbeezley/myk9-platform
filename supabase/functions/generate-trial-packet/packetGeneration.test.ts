// @vitest-environment node
//
// These cover code that runs under Deno, never in a browser. The suite's
// global jsdom environment is not just unnecessary here, it is ACTIVELY
// MISLEADING: jsdom swaps in its own `ArrayBuffer`, so a buffer built in test
// code is a different realm's object from the one `crypto.subtle` accepts, and
// `digest` rejects it with "2nd argument is not instance of ArrayBuffer" — on
// CI's Node and not on every developer's.
import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../_shared/http/responses.ts';
import {
  generateTrialPackets,
  sha256Hex,
  validateGenerateRequest,
  type PacketGenerationDeps,
} from './packetGeneration.ts';
import type { EmergencyPacketInput } from '../_shared/trialPacket/renderer/types.ts';
import { PACKET_CLAIM_LEASE_MS, shouldReclaimStalePacketClaim } from './packetClaim.ts';
import { TrialPacketProviderError } from '../_shared/trialPacket/email.ts';

const SHOW_ID = 'a0000000-0000-4000-8000-000000000001';
const CLUB_ID = 'c0000000-0000-4000-8000-000000000001';

/** Two trials on Saturday, one on Sunday — the shape the per-day split exists for. */
function packetInput(): EmergencyPacketInput {
  const trials = [
    { id: 't1', date: '2026-09-19', name: 'Trial 1', trialNumber: '1', registryId: 'akc' },
    { id: 't2', date: '2026-09-19', name: 'Trial 2', trialNumber: '2', registryId: 'akc' },
    { id: 't3', date: '2026-09-20', name: 'Trial 3', trialNumber: '3', registryId: 'akc' },
  ];
  const classes = trials.map((trial, index) => ({
    id: `c${index + 1}`,
    trialId: trial.id,
    name: 'Interior Novice',
    element: 'Interior',
    level: 'Novice',
    section: null,
    classNumber: null,
    displayOrder: index,
    judgeName: 'Pat Judge',
    ringLabel: null,
    startTime: null,
    timeLimitSeconds: 180,
    timeLimitArea2Seconds: null,
    timeLimitArea3Seconds: null,
    numAreas: 1,
  }));
  const entries = classes.map((classItem, index) => ({
    id: `e${index + 1}`,
    armband: index + 1,
    runOrder: index + 1,
    callName: `Dog ${index + 1}`,
    breed: 'Border Collie',
    handler: `Handler ${index + 1}`,
    registrationNumber: null,
    section: null,
    classId: classItem.id,
    trialId: classItem.trialId,
  }));
  return {
    generatedAt: '2026-09-18T02:00:00.000Z',
    show: {
      id: SHOW_ID,
      name: 'Heartland Scent Work',
      startDate: '2026-09-19',
      endDate: '2026-09-20',
    },
    trials,
    classes,
    entries,
  };
}

interface StubOptions {
  rpcData?: unknown;
  rpcError?: unknown;
  deliveredDates?: string[];
  uploadError?: unknown;
  /** Claims already in the ledger, as if another run had written them. */
  existingClaims?: Record<string, { claimed_at: string; completed_at: string | null }>;
  /** The `sent` audit insert fails while the email itself succeeds. */
  auditInsertFails?: boolean;
}

function makeStub(options: StubOptions = {}) {
  const {
    rpcData = packetInput(),
    rpcError = null,
    deliveredDates = [],
    uploadError = null,
    auditInsertFails = false,
  } = options;
  const uploads: string[] = [];
  const removed: string[] = [];
  const inserts: Record<string, unknown>[] = [];
  const claims: Record<string, { claimed_at: string; completed_at: string | null }> = {
    ...(options.existingClaims ?? {}),
  };
  const claimOps: string[] = [];
  let deliveredLookupDate: string | null = null;
  let claimLookupDate: string | null = null;

  function thenable(result: unknown) {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'is', 'or', 'in', 'order', 'limit']) {
      query[method] = () => query;
    }
    query.eq = (column: string, value: unknown) => {
      if (column === 'trial_date') deliveredLookupDate = value as string;
      return query;
    };
    query.match = (criteria: Record<string, unknown>) => {
      if (criteria.trial_date) claimLookupDate = criteria.trial_date as string;
      return query;
    };
    query.maybeSingle = () => Promise.resolve(resolveResult(result));
    query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(resolveResult(result)).then(resolve, reject);
    query.insert = (row: Record<string, unknown>) => {
      // The audit row's CHECK constraints (byte_size <= 20MiB, page_count > 0)
      // can reject AFTER the email is already gone. That is the case that used
      // to throw and cause duplicate sends.
      if (auditInsertFails && row.delivery_status === 'sent') {
        return Promise.resolve({ error: { code: '23514', message: 'byte_size check' } });
      }
      inserts.push(row);
      return Promise.resolve({ error: null });
    };
    return query;
  }

  function resolveResult(result: unknown) {
    if (result !== 'delivered-lookup') return result;
    return {
      data:
        deliveredLookupDate && deliveredDates.includes(deliveredLookupDate)
          ? { snapshot_id: 'existing' }
          : null,
      error: null,
    };
  }

  // The claim ledger, modelled closely enough that the unique constraint, the
  // stale-lease read, the CAS reclaim and the release are all exercised.
  function claimQuery() {
    const q: Record<string, unknown> = {};
    let matched: Record<string, unknown> = {};
    let casClaimedAt: string | null = null;
    let requireIncomplete = false;
    for (const method of ['select', 'is', 'or', 'in', 'order', 'limit']) {
      q[method] = (...args: unknown[]) => {
        if (method === 'is' && args[0] === 'completed_at' && args[1] === null) {
          requireIncomplete = true;
        }
        return q;
      };
    }
    q.match = (criteria: Record<string, unknown>) => {
      matched = criteria;
      return q;
    };
    q.eq = (column: string, value: unknown) => {
      if (column === 'claimed_at') casClaimedAt = value as string;
      return q;
    };
    const key = () => String(matched.trial_date ?? '');
    const holds = () => {
      const row = claims[key()];
      if (!row) return false;
      if (casClaimedAt !== null && row.claimed_at !== casClaimedAt) return false;
      if (requireIncomplete && row.completed_at) return false;
      return true;
    };
    q.insert = (row: Record<string, unknown>) => {
      const date = String(row.trial_date);
      if (claims[date]) {
        claimOps.push(`conflict:${date}`);
        return Promise.resolve({ error: { code: '23505', message: 'duplicate' } });
      }
      claims[date] = { claimed_at: String(row.claimed_at), completed_at: null };
      claimOps.push(`claim:${date}`);
      return Promise.resolve({ error: null });
    };
    q.update = (patch: Record<string, unknown>) => {
      const chain: Record<string, unknown> = {};
      const settle = () => {
        if (!holds()) return { data: [], error: null };
        Object.assign(claims[key()], patch);
        claimOps.push(patch.completed_at ? `complete:${key()}` : `reclaim:${key()}`);
        return { data: [{ id: 'claim-1' }], error: null };
      };
      for (const m of ['match', 'eq', 'is', 'select']) {
        chain[m] = (...args: unknown[]) => {
          (q[m] as (...a: unknown[]) => unknown)(...args);
          return chain;
        };
      }
      chain.then = (res: (v: unknown) => unknown, rej?: (r: unknown) => unknown) =>
        Promise.resolve(settle()).then(res, rej);
      return chain;
    };
    q.delete = () => {
      const chain: Record<string, unknown> = {};
      const settle = () => {
        if (holds()) {
          delete claims[key()];
          claimOps.push(`release:${key()}`);
        }
        return { data: [], error: null };
      };
      for (const m of ['match', 'eq', 'is']) {
        chain[m] = (...args: unknown[]) => {
          (q[m] as (...a: unknown[]) => unknown)(...args);
          return chain;
        };
      }
      chain.then = (res: (v: unknown) => unknown, rej?: (r: unknown) => unknown) =>
        Promise.resolve(settle()).then(res, rej);
      return chain;
    };
    q.maybeSingle = () => {
      const row = claims[key()];
      claimOps.push(`read:${key()}`);
      return Promise.resolve({ data: row ?? null, error: null });
    };
    q.then = (res: (v: unknown) => unknown, rej?: (r: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(res, rej);
    return q;
  }

  const supabase = {
    rpc: vi.fn().mockResolvedValue({ data: rpcData, error: rpcError }),
    from(table: string) {
      if (table === 'shows') {
        return thenable({
          data: {
            id: SHOW_ID,
            name: 'Heartland Scent Work',
            club_id: CLUB_ID,
            end_date: '2026-09-20',
          },
          error: null,
        });
      }
      if (table === 'user_roles') {
        return thenable({
          data: [
            {
              user_id: 'p1',
              auth_user_id: 'u1',
              club_id: null,
              show_id: SHOW_ID,
              roles: { name: 'secretary' },
              people: { email: 'secretary@example.com' },
            },
          ],
          error: null,
        });
      }
      if (table === 'club_members') return thenable({ data: [], error: null });
      if (table === 'trial_packet_generation_claims') return claimQuery();
      if (table === 'trial_packet_snapshots') return thenable('delivered-lookup');
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from() {
        return {
          upload: (path: string) => {
            if (uploadError) return Promise.resolve({ error: uploadError });
            uploads.push(path);
            return Promise.resolve({ error: null });
          },
          remove: (paths: string[]) => {
            removed.push(...paths);
            return Promise.resolve({ error: null });
          },
          list: (_prefix: string, opts: { search: string }) =>
            Promise.resolve({ data: [{ name: opts.search }], error: null }),
          createSignedUrl: () =>
            Promise.resolve({ data: { signedUrl: 'https://storage/signed' }, error: null }),
        };
      },
    },
  } as unknown as Parameters<typeof generateTrialPackets>[0];

  return { supabase, uploads, removed, inserts, claims, claimOps };
}

let snapshotCounter = 0;
function makeDeps(overrides: Partial<PacketGenerationDeps> = {}): PacketGenerationDeps {
  snapshotCounter = 0;
  return {
    renderPdf: model => new Uint8Array(model.pages.length * 10),
    newSnapshotId: () => `snapshot-${(snapshotCounter += 1)}`,
    getEnv: () => 'resend-key',
    now: () => new Date('2026-09-18T02:00:00.000Z'),
    sendEmail: vi.fn().mockResolvedValue('provider-1'),
    ...overrides,
  };
}

describe('validateGenerateRequest', () => {
  it('requires a real show id', () => {
    expect(() => validateGenerateRequest({})).toThrow(HttpError);
    expect(() => validateGenerateRequest({ showId: 'not-a-uuid' })).toThrow(HttpError);
    expect(validateGenerateRequest({ showId: SHOW_ID })).toEqual({ showId: SHOW_ID });
  });

  it('rejects a trial date that is not a plain calendar day', () => {
    // This reaches the RPC as a `date` parameter and the email subject; a
    // timestamp or an arbitrary string turns a bad request into a 500 deeper in.
    expect(() => validateGenerateRequest({ showId: SHOW_ID, trialDate: '09/19/2026' })).toThrow(
      HttpError
    );
    expect(() =>
      validateGenerateRequest({ showId: SHOW_ID, trialDate: '2026-09-19T00:00:00Z' })
    ).toThrow(HttpError);
    expect(validateGenerateRequest({ showId: SHOW_ID, trialDate: '2026-09-19' })).toEqual({
      showId: SHOW_ID,
      trialDate: '2026-09-19',
    });
  });

  it('rejects a day that does not exist', () => {
    // A shape-only regex admits these. Postgres then refuses to bind the RPC's
    // `date` argument, so a client mistake arrives as a 500 — which a
    // scheduler will retry, forever, on a date that will never be valid.
    for (const impossible of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-09-31']) {
      expect(() => validateGenerateRequest({ showId: SHOW_ID, trialDate: impossible })).toThrow(
        HttpError
      );
    }
    // A real leap day must still pass.
    expect(
      validateGenerateRequest({ showId: SHOW_ID, trialDate: '2028-02-29' }).trialDate
    ).toBe('2028-02-29');
  });
});

describe('generateTrialPackets', () => {
  it('emits one packet per trial day, not one per trial', async () => {
    const { supabase, uploads, inserts } = makeStub();

    const summary = await generateTrialPackets(supabase, { showId: SHOW_ID }, makeDeps());

    // Saturday holds two trials and Sunday one; a packet per TRIAL would be
    // three, and would split Saturday's two trials into separate stacks.
    expect(summary.generated.map(packet => packet.trialDate)).toEqual([
      '2026-09-19',
      '2026-09-20',
    ]);
    expect(uploads).toHaveLength(2);
    expect(inserts).toHaveLength(2);
    expect(inserts.every(row => row.generated_source === 'automated')).toBe(true);
    expect(inserts.every(row => row.generated_by === null)).toBe(true);
    expect(inserts.map(row => row.trial_date)).toEqual(['2026-09-19', '2026-09-20']);
  });

  it('asks the source for one day when one day was requested', async () => {
    const { supabase } = makeStub();
    await generateTrialPackets(supabase, { showId: SHOW_ID, trialDate: '2026-09-20' }, makeDeps());
    expect(supabase.rpc).toHaveBeenCalledWith('emergency_packet_input', {
      p_show_id: SHOW_ID,
      p_trial_date: '2026-09-20',
    });
  });

  it('asks for the whole show when no day is named', async () => {
    const { supabase } = makeStub();
    await generateTrialPackets(supabase, { showId: SHOW_ID }, makeDeps());
    expect(supabase.rpc).toHaveBeenCalledWith('emergency_packet_input', {
      p_show_id: SHOW_ID,
      p_trial_date: null,
    });
  });

  it('does not re-send a day that already has a delivered packet', async () => {
    const { supabase, uploads } = makeStub({ deliveredDates: ['2026-09-19'] });

    const summary = await generateTrialPackets(supabase, { showId: SHOW_ID }, makeDeps());

    expect(summary.skipped).toEqual([{ trialDate: '2026-09-19', reason: 'already-delivered' }]);
    expect(summary.generated.map(packet => packet.trialDate)).toEqual(['2026-09-20']);
    // The check must precede the upload, or a nightly re-run accumulates
    // orphan objects in a bucket nothing ever deletes from.
    expect(uploads).toHaveLength(1);
  });

  it('prints nothing rather than a stack of empty sheets', async () => {
    const input = packetInput();
    const { supabase, uploads } = makeStub({ rpcData: { ...input, entries: [] } });

    const summary = await generateTrialPackets(supabase, { showId: SHOW_ID }, makeDeps());

    expect(summary.generated).toEqual([]);
    expect(summary.skipped.map(skip => skip.reason)).toEqual([
      'nothing-to-print',
      'nothing-to-print',
    ]);
    expect(uploads).toEqual([]);
  });

  it('stamps every packet of a run with one generatedAt, not the source row', async () => {
    // The RPC's own `generatedAt` is whenever that query ran. Two days must
    // agree on when the run happened, and the pages say so in their header.
    const { supabase, inserts } = makeStub();
    await generateTrialPackets(supabase, { showId: SHOW_ID }, makeDeps());
    expect(new Set(inserts.map(row => row.generated_at))).toEqual(
      new Set(['2026-09-18T02:00:00.000Z'])
    );
  });

  it('says so when the day it was asked for produced nothing', async () => {
    // Empty `generated` AND empty `skipped` is indistinguishable from success.
    // The caller is a scheduler; it has no other way to notice a mistyped date
    // or a day whose trials were all cancelled.
    const input = packetInput();
    const { supabase, uploads } = makeStub({ rpcData: { ...input, trials: [], classes: [], entries: [] } });

    const summary = await generateTrialPackets(
      supabase,
      { showId: SHOW_ID, trialDate: '2026-09-21' },
      makeDeps()
    );

    expect(summary.generated).toEqual([]);
    expect(summary.skipped).toEqual([{ trialDate: '2026-09-21', reason: 'nothing-to-print' }]);
    expect(uploads).toEqual([]);
  });

  it('fails loudly when the source returns something that is not a packet input', async () => {
    const { supabase } = makeStub({ rpcData: { show: null } });
    await expect(
      generateTrialPackets(supabase, { showId: SHOW_ID }, makeDeps())
    ).rejects.toBeInstanceOf(HttpError);
  });

  it('does not deliver a packet it could not store, and keeps going', async () => {
    const { supabase, inserts } = makeStub({ uploadError: new Error('bucket full') });

    const summary = await generateTrialPackets(supabase, { showId: SHOW_ID }, makeDeps());

    expect(inserts).toEqual([]);
    // Both days failed, and BOTH are reported. Throwing on the first lost
    // every later day of a whole-show request and returned a 500 that said
    // nothing about which days had succeeded.
    expect(summary.failed.map(f => f.trialDate)).toEqual(['2026-09-19', '2026-09-20']);
    expect(summary.generated).toEqual([]);
  });

  it('accepts the ids this project actually issues', async () => {
    // seed-demo.sql mints `dededede-…`, whose RFC-4122 version and variant
    // nibbles are 0. The old validator rejected it, so the cron could not have
    // produced a packet for the only show on staging — and answered 400 into a
    // fire-and-forget pg_net call, where nobody would ever have seen it.
    expect(
      validateGenerateRequest({ showId: 'dededede-0000-0000-0000-000000000010' }).showId
    ).toBe('dededede-0000-0000-0000-000000000010');
    expect(() => validateGenerateRequest({ showId: 'dededede-0000-0000-0000-00000000001' })).toThrow(
      HttpError
    );
  });
});

describe('the trial-day claim (MYK9-228 phase 4)', () => {
  const SAT = '2026-09-19';
  const SUN = '2026-09-20';

  it('claims a day before rendering anything', async () => {
    const { supabase, claimOps, claims } = makeStub();
    await generateTrialPackets(supabase, { showId: SHOW_ID }, makeDeps());

    // Claim first, complete last. If generation could start before the claim
    // landed, two overlapping cron runs would both render and the secretary
    // would get two emails and two near-identical stacks.
    expect(claimOps.indexOf(`claim:${SAT}`)).toBeLessThan(claimOps.indexOf(`complete:${SAT}`));
    expect(claims[SAT]?.completed_at).toBe('2026-09-18T02:00:00.000Z');
    expect(claims[SUN]?.completed_at).toBe('2026-09-18T02:00:00.000Z');
  });

  it('skips a day another run already finished', async () => {
    const { supabase, uploads } = makeStub({
      existingClaims: {
        [SAT]: { claimed_at: '2026-09-18T01:00:00.000Z', completed_at: '2026-09-18T01:05:00.000Z' },
      },
    });

    const summary = await generateTrialPackets(supabase, { showId: SHOW_ID }, makeDeps());

    expect(summary.skipped).toEqual([{ trialDate: SAT, reason: 'already-delivered' }]);
    expect(summary.generated.map(p => p.trialDate)).toEqual([SUN]);
    expect(uploads).toHaveLength(1);
  });

  it('leaves a day alone while another run still holds a fresh claim', async () => {
    // One minute old, lease is ten. That run is probably mid-render; stealing
    // the day from it is how you get two packets.
    const { supabase, uploads } = makeStub({
      existingClaims: {
        [SAT]: { claimed_at: '2026-09-18T01:59:00.000Z', completed_at: null },
      },
    });

    const summary = await generateTrialPackets(supabase, { showId: SHOW_ID }, makeDeps());

    // NOT 'already-delivered' — nothing has been delivered. Collapsing the two
    // would make a permanently stuck run look like a success.
    expect(summary.skipped).toEqual([{ trialDate: SAT, reason: 'in-flight' }]);
    expect(uploads).toHaveLength(1);
  });

  it('takes over a claim whose run died mid-render', async () => {
    // An hour old with nothing completed: that run is gone. Reading the unique
    // conflict as "already done" would leave the trial with no paper at all.
    const { supabase, uploads, claimOps, claims } = makeStub({
      existingClaims: {
        [SAT]: { claimed_at: '2026-09-18T01:00:00.000Z', completed_at: null },
      },
    });

    const summary = await generateTrialPackets(supabase, { showId: SHOW_ID }, makeDeps());

    expect(summary.skipped).toEqual([]);
    expect(summary.generated.map(p => p.trialDate)).toEqual([SAT, SUN]);
    expect(claimOps).toContain(`reclaim:${SAT}`);
    expect(claims[SAT]?.completed_at).toBe('2026-09-18T02:00:00.000Z');
    expect(uploads).toHaveLength(2);
  });

  it('releases the claim when generation fails, so the next run retries', async () => {
    // Holding it would let one bad render suppress the day for a whole lease,
    // and a claim abandoned past the last run of the evening means no paper.
    const { supabase, claims, claimOps, removed } = makeStub({
      uploadError: new Error('bucket full'),
    });

    const summary = await generateTrialPackets(supabase, { showId: SHOW_ID }, makeDeps());

    expect(summary.failed).toHaveLength(2);
    expect(claimOps).toContain(`release:${SAT}`);
    expect(claims[SAT]).toBeUndefined();
    // Nothing was uploaded, so nothing to clean up.
    expect(removed).toEqual([]);
  });

  it('completes the claim when the email went out but the audit row did not', async () => {
    // The killer case. Delivery used to THROW here, the claim was released,
    // and the next run found no claim AND no `sent` snapshot — because the
    // statement that writes that snapshot is exactly the one that failed. Six
    // identical emails a night, deterministic for any packet over 20MiB.
    const { supabase, claims, claimOps } = makeStub({ auditInsertFails: true });

    const summary = await generateTrialPackets(supabase, { showId: SHOW_ID }, makeDeps());

    expect(summary.generated.map(p => p.trialDate)).toEqual([SAT, SUN]);
    expect(summary.failed).toEqual([]);
    expect(claimOps).not.toContain(`release:${SAT}`);
    expect(claims[SAT]?.completed_at).toBe('2026-09-18T02:00:00.000Z');
    // Surfaced rather than swallowed.
    expect(summary.unrecordedCompletions).toBe(2);
  });

  it('deletes the object it uploaded when delivery then fails', async () => {
    // Nothing ever deletes from the trial-packets bucket, so six failed
    // evening runs would leave six orphan PDFs per show-day.
    const sendEmail = vi.fn().mockRejectedValue(new TrialPacketProviderError(500));
    const { supabase, removed } = makeStub();

    const summary = await generateTrialPackets(
      supabase,
      { showId: SHOW_ID },
      makeDeps({ sendEmail })
    );

    expect(summary.failed).toHaveLength(2);
    expect(removed).toHaveLength(2);
    expect(removed[0]).toMatch(/^a0000000-0000-4000-8000-000000000001\/snapshot-1\.pdf$/);
  });

  it('completes the claim without re-sending when a manual packet already covers the day', async () => {
    // The manual path writes no claim, so the sent-snapshot check is the only
    // thing that sees it. Completing rather than releasing stops every later
    // run in the window from re-asking.
    const { supabase, uploads, claims } = makeStub({ deliveredDates: [SAT] });

    const summary = await generateTrialPackets(supabase, { showId: SHOW_ID }, makeDeps());

    expect(summary.skipped).toEqual([{ trialDate: SAT, reason: 'already-delivered' }]);
    expect(claims[SAT]?.completed_at).toBe('2026-09-18T02:00:00.000Z');
    expect(uploads).toHaveLength(1);
  });

  it('does not claim a day it has nothing to print for', async () => {
    const input = packetInput();
    const { supabase, claims } = makeStub({ rpcData: { ...input, entries: [] } });

    await generateTrialPackets(supabase, { showId: SHOW_ID }, makeDeps());

    expect(Object.keys(claims)).toEqual([]);
  });
});

describe('shouldReclaimStalePacketClaim', () => {
  const base = Date.parse('2026-09-18T02:00:00.000Z');

  it('never reclaims a completed run', () => {
    expect(
      shouldReclaimStalePacketClaim(
        { claimed_at: '1970-01-01T00:00:00.000Z', completed_at: '2020-01-01T00:00:00.000Z' },
        base
      )
    ).toBe(false);
  });

  it('waits out the lease before taking over an incomplete one', () => {
    const justInside = new Date(base - (PACKET_CLAIM_LEASE_MS - 1000)).toISOString();
    const justOutside = new Date(base - (PACKET_CLAIM_LEASE_MS + 1000)).toISOString();
    expect(shouldReclaimStalePacketClaim({ claimed_at: justInside, completed_at: null }, base)).toBe(
      false
    );
    expect(
      shouldReclaimStalePacketClaim({ claimed_at: justOutside, completed_at: null }, base)
    ).toBe(true);
  });

  it('reclaims rather than blocks when the timestamp is unreadable', () => {
    // A duplicate email is recoverable; a trial day with no paper is the
    // failure this whole feature exists to prevent.
    expect(shouldReclaimStalePacketClaim({ claimed_at: 'not a date', completed_at: null }, base)).toBe(
      true
    );
  });
});

describe('sha256Hex', () => {
  it('matches the digest the manual path records for the same bytes', async () => {
    // Both paths write to `trial_packet_snapshots.sha256`, whose CHECK is
    // lowercase hex of exactly 64 characters.
    const digest = await sha256Hex(new Uint8Array([1, 2, 3]));
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).toBe('039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81');
  });
});
