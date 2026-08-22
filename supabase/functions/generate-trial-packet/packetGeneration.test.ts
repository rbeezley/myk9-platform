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
}

function makeStub(options: StubOptions = {}) {
  const { rpcData = packetInput(), rpcError = null, deliveredDates = [], uploadError = null } =
    options;
  const uploads: string[] = [];
  const inserts: Record<string, unknown>[] = [];
  let deliveredLookupDate: string | null = null;

  function thenable(result: unknown) {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'is', 'or', 'in', 'order', 'limit']) {
      query[method] = () => query;
    }
    query.eq = (column: string, value: unknown) => {
      if (column === 'trial_date') deliveredLookupDate = value as string;
      return query;
    };
    query.maybeSingle = () => Promise.resolve(resolveResult(result));
    query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(resolveResult(result)).then(resolve, reject);
    query.insert = (row: Record<string, unknown>) => {
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
      if (table === 'trial_packet_snapshots') return thenable('delivered-lookup');
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from() {
        return {
          upload: (path: string) => {
            uploads.push(path);
            return Promise.resolve({ error: uploadError });
          },
          list: (_prefix: string, opts: { search: string }) =>
            Promise.resolve({ data: [{ name: opts.search }], error: null }),
          createSignedUrl: () =>
            Promise.resolve({ data: { signedUrl: 'https://storage/signed' }, error: null }),
        };
      },
    },
  } as unknown as Parameters<typeof generateTrialPackets>[0];

  return { supabase, uploads, inserts };
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

  it('does not deliver a packet it could not store', async () => {
    const { supabase, inserts } = makeStub({ uploadError: new Error('bucket full') });
    await expect(
      generateTrialPackets(supabase, { showId: SHOW_ID }, makeDeps())
    ).rejects.toBeInstanceOf(HttpError);
    expect(inserts).toEqual([]);
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
