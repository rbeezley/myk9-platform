/**
 * MYK9-2009: a new code for a judge must not strand the scores still queued under
 * the old one.
 *
 * Wires the REAL `sharedMutationManager` to the REAL `MutationManager` over fake
 * IndexedDB and fakes only the edges: the Supabase auth session and the server's
 * answer to `ringside_update_entry`. The server answers exactly as the database
 * does (supabase/migrations/20261113224300_myk9_1950_per_judge_passcodes.sql): a
 * claim whose code was regenerated, or whose code row was deleted when the judge's
 * last class was removed, gets 42501 "Passcode has been regenerated; re-enter a new
 * code"; a claim that is current is accepted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager, REPLICATION_STORES, type PendingMutation } from '@myk9/replication';

interface FakeSession {
  access_token: string;
  user: {
    id: string;
    is_anonymous: boolean;
    app_metadata: {
      kind: string;
      show_id: string;
      ringside_role: string;
      ringside_person_id: string;
    };
  };
}

const fake = vi.hoisted(() => ({
  session: null as unknown,
  /** Tokens the server still honours (a regenerated or retired code is not here). */
  liveTokens: new Set<string>(),
  rpcCalls: [] as Array<{ token: string; entryId: unknown; accepted: boolean }>,
}));

const REGENERATED = {
  code: '42501',
  message: 'Passcode has been regenerated; re-enter a new code',
  details: null,
  hint: null,
};

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: fake.session }, error: null }),
    },
  },
  createSessionBoundSupabaseClient: (token: string) => ({
    rpc: (_name: string, args: Record<string, unknown>) => {
      const accepted = fake.liveTokens.has(token);
      fake.rpcCalls.push({ token, entryId: args.p_entry_id, accepted });
      return Promise.resolve(
        accepted ? { data: 2, error: null } : { data: null, error: REGENERATED }
      );
    },
  }),
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/services/database/persistedAuthUserId', () => ({
  readPersistedAuthUserId: () => null,
  readPersistedAuthIsAnonymous: (authUserId: string) => {
    const user = (fake.session as FakeSession | null)?.user;
    return user?.id === authUserId && user.is_anonymous === true;
  },
  readPersistedAuthRingsideClaim: (authUserId: string) => {
    const user = (fake.session as FakeSession | null)?.user;
    return user?.id === authUserId
      ? `${user.app_metadata.ringside_role}:${user.app_metadata.ringside_person_id}`
      : undefined;
  },
}));

import { mutationManager } from '../sharedMutationManager';
import { adoptHeldRingsideScoresForLiveClaim } from '../heldRingsideScores';
import { setDeviceOnline } from './registrationQueueHarness';

const SCORE_RPC = { name: 'ringside_update_entry', fields: { result_status: 'qualified' } };
const SHOW = 'show-x';

let tokenCounter = 0;

/** A passcode session whose code the server still honours (a freshly entered code). */
function enterCode(userId: string, person = 'judge-pat'): string {
  const token = `token-${++tokenCounter}`;
  fake.liveTokens.add(token);
  fake.session = {
    access_token: token,
    user: {
      id: userId,
      is_anonymous: true,
      app_metadata: {
        kind: 'ringside_passcode',
        show_id: SHOW,
        ringside_role: 'judge',
        ringside_person_id: person,
      },
    },
  } satisfies FakeSession;
  return token;
}

/** The secretary taps New code (or removes the last class): the old token is no longer honoured. */
function rotateCode(token: string): void {
  fake.liveTokens.delete(token);
}

/** revokeRingsidePasscodeAccess signs the anonymous user out. */
function signOut(): void {
  fake.session = null;
}

function queueScore(entryId: string): Promise<string> {
  return mutationManager.queueMutation(
    'entries',
    'UPDATE',
    entryId,
    { id: entryId },
    undefined,
    undefined,
    SCORE_RPC,
    false,
    undefined,
    SHOW
  );
}

async function readStore(store: string): Promise<PendingMutation[]> {
  const db = await databaseManager.getDatabase('MutationManager');
  return (await db.getAll(store)) as PendingMutation[];
}
const pending = () => readStore(REPLICATION_STORES.PENDING_MUTATIONS);
const failed = () => readStore(REPLICATION_STORES.FAILED_MUTATIONS);
const rowIds = (rows: PendingMutation[]) => rows.map(row => row.rowId).sort();

beforeEach(async () => {
  await databaseManager.reset();
  fake.session = null;
  fake.liveTokens = new Set();
  fake.rpcCalls = [];
  setDeviceOnline(true);
});

afterEach(async () => {
  mutationManager.destroy();
  await databaseManager.reset();
});

describe('a new code for a judge with scores still queued (MYK9-2009)', () => {
  it('sends every score queued under the old code once the judge enters the new one', async () => {
    const oldToken = enterCode('anon-1');
    await queueScore('e1');
    await queueScore('e2');
    await queueScore('e3');
    rotateCode(oldToken);

    // Back in signal: every upload is refused as "regenerated" and parks as a dead letter.
    await mutationManager.uploadPendingMutations();
    expect(await pending()).toEqual([]);
    expect(rowIds(await failed())).toEqual(['e1', 'e2', 'e3']);

    // The failure handler revokes: the anonymous user is signed out. The judge enters the new code.
    signOut();
    const newToken = enterCode('anon-2');
    expect(await adoptHeldRingsideScoresForLiveClaim()).toBe(3);
    await mutationManager.uploadPendingMutations();

    const accepted = fake.rpcCalls.filter(call => call.token === newToken && call.accepted);
    expect(accepted.map(call => call.entryId).sort()).toEqual(['e1', 'e2', 'e3']);
    expect(await pending()).toEqual([]);
    expect(await failed()).toEqual([]);
  });

  it('sends the scores that were still pending when the heartbeat signed the judge out first', async () => {
    const oldToken = enterCode('anon-1');
    await queueScore('e1');
    await queueScore('e2');
    rotateCode(oldToken);
    signOut();

    const newToken = enterCode('anon-2');
    expect(await adoptHeldRingsideScoresForLiveClaim()).toBe(2);
    await mutationManager.uploadPendingMutations();

    const accepted = fake.rpcCalls.filter(call => call.token === newToken && call.accepted);
    expect(accepted.map(call => call.entryId).sort()).toEqual(['e1', 'e2']);
    expect(await failed()).toEqual([]);
  });

  it('sends a mix: some already parked as dead letters, some still pending behind them', async () => {
    const oldToken = enterCode('anon-1');
    await queueScore('e1');
    rotateCode(oldToken);
    await mutationManager.uploadPendingMutations();
    await queueScore('e2');
    signOut();

    const newToken = enterCode('anon-2');
    expect(await adoptHeldRingsideScoresForLiveClaim()).toBe(2);
    await mutationManager.uploadPendingMutations();

    const accepted = fake.rpcCalls.filter(call => call.token === newToken && call.accepted);
    expect(accepted.map(call => call.entryId).sort()).toEqual(['e1', 'e2']);
    expect(await pending()).toEqual([]);
    expect(await failed()).toEqual([]);
  });

  it('resends a dead letter when the same anonymous user re-enters the code', async () => {
    const oldToken = enterCode('anon-1');
    await queueScore('e1');
    rotateCode(oldToken);
    await mutationManager.uploadPendingMutations();
    expect(rowIds(await failed())).toEqual(['e1']);

    // The sign-out never landed (offline): startAnonymousRingsideSession reuses the same user.
    const newToken = enterCode('anon-1');
    expect(await adoptHeldRingsideScoresForLiveClaim()).toBe(1);
    await mutationManager.uploadPendingMutations();

    expect(fake.rpcCalls.filter(call => call.token === newToken && call.accepted)).toHaveLength(1);
    expect(await failed()).toEqual([]);
  });

  it('keeps the server in charge: a score the new code is still refused for parks again, not lost', async () => {
    const oldToken = enterCode('anon-1');
    await queueScore('e1');
    rotateCode(oldToken);
    await mutationManager.uploadPendingMutations();
    signOut();

    const newToken = enterCode('anon-2');
    expect(await adoptHeldRingsideScoresForLiveClaim()).toBe(1);
    rotateCode(newToken);
    await mutationManager.uploadPendingMutations();

    expect(fake.rpcCalls.filter(call => call.accepted)).toEqual([]);
    expect(rowIds(await failed())).toEqual(['e1']);
    expect((await failed())[0]).toMatchObject({ authUserId: 'anon-2', showId: SHOW });
  });

  it('never adopts a dead letter refused for another reason, or one from another show', async () => {
    const oldToken = enterCode('anon-1');
    await queueScore('e1');
    await queueScore('e2');
    rotateCode(oldToken);
    await mutationManager.uploadPendingMutations();
    const db = await databaseManager.getDatabase('MutationManager');
    const [first, second] = (await failed()).sort((a, b) => a.rowId.localeCompare(b.rowId));
    await db.put(REPLICATION_STORES.FAILED_MUTATIONS, {
      ...first,
      error: 'Non-retryable error: Entry already scored by someone else',
    });
    await db.put(REPLICATION_STORES.FAILED_MUTATIONS, { ...second, showId: 'show-y' });
    signOut();

    const newToken = enterCode('anon-2');
    expect(await adoptHeldRingsideScoresForLiveClaim()).toBe(0);
    await mutationManager.uploadPendingMutations();

    expect(fake.rpcCalls.filter(call => call.token === newToken)).toEqual([]);
    expect(rowIds(await failed())).toEqual(['e1', 'e2']);
  });

  it("keeps one judge's refused and queued scores from another judge on a shared device", async () => {
    const patOld = enterCode('anon-1', 'judge-pat');
    await queueScore('e1');
    rotateCode(patOld);
    await mutationManager.uploadPendingMutations();
    await queueScore('e2');
    signOut();

    // Sam enters his own code on the same device for the same show.
    const samToken = enterCode('anon-2', 'judge-sam');
    expect(await adoptHeldRingsideScoresForLiveClaim()).toBe(0);
    await mutationManager.uploadPendingMutations();
    expect(fake.rpcCalls.filter(call => call.token === samToken)).toEqual([]);
    expect(rowIds(await failed())).toEqual(['e1']);
    expect(rowIds(await pending())).toEqual(['e2']);
    signOut();

    // Pat returns with her new code and gets both.
    const patNew = enterCode('anon-3', 'judge-pat');
    expect(await adoptHeldRingsideScoresForLiveClaim()).toBe(2);
    await mutationManager.uploadPendingMutations();
    const accepted = fake.rpcCalls.filter(call => call.token === patNew && call.accepted);
    expect(accepted.map(call => call.entryId).sort()).toEqual(['e1', 'e2']);
    expect(await failed()).toEqual([]);
  });
});
