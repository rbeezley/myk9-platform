/**
 * MYK9-1053 Part A: an offline-scored queue survives a forced re-login.
 *
 * Wires the REAL `sharedMutationManager` (the app's upload-context and identity
 * adapters) to the REAL `MutationManager` over fake IndexedDB, and fakes only
 * the two edges: the Supabase auth session (`getSession`) and the server's
 * answer to the pinned client's `rpc('ringside_update_entry')`.
 *
 * Scenarios, in the order the ticket lists them:
 *   A  the session dies (refresh fails, SIGNED_OUT, or the server says
 *      "JWT expired"): the queue is KEPT.
 *   B  the SAME user signs back in: it flushes under that identity, on the new
 *      token.
 *   C  a DIFFERENT user signs in: it is HELD (never sent as them), and still
 *      flushes once its owner returns.
 *   D  a passcode (anonymous) session: same rules, plus the stranding edge when
 *      the anonymous session cannot be resumed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager, REPLICATION_STORES, type PendingMutation } from '@myk9/replication';

interface FakeSession {
  access_token: string;
  user: {
    id: string;
    is_anonymous?: boolean;
    app_metadata?: { kind: string; show_id: string; ringside_role: string };
  };
}

interface RpcCall {
  token: string;
  name: string;
  args: Record<string, unknown>;
}

const fake = vi.hoisted(() => ({
  session: null as unknown,
  sessionError: null as Error | null,
  rpcCalls: [] as Array<{ token: string; name: string; args: Record<string, unknown> }>,
  rpcAnswer: null as null | (() => { data: unknown; error: unknown }),
  persistedUserId: null as string | null,
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: fake.session },
        error: fake.sessionError,
      }),
    },
  },
  createSessionBoundSupabaseClient: (token: string) => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      fake.rpcCalls.push({ token, name, args });
      return Promise.resolve(fake.rpcAnswer ? fake.rpcAnswer() : { data: 2, error: null });
    },
  }),
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/services/database/persistedAuthUserId', () => ({
  readPersistedAuthUserId: () => fake.persistedUserId,
  // The persisted session is the live fake one: that is what supabase-js stores.
  readPersistedAuthIsAnonymous: (authUserId: string) => {
    const user = (fake.session as FakeSession | null)?.user;
    return user?.id === authUserId && user.is_anonymous === true;
  },
}));

import { mutationManager } from '../sharedMutationManager';
import { adoptHeldRingsideScores, countHeldRingsideScores } from '../heldRingsideScores';
import { setDeviceOnline } from './registrationQueueHarness';

let tokenCounter = 0;
const nextToken = (): string => `token-${++tokenCounter}`;

const JWT_EXPIRED = { code: 'PGRST301', message: 'JWT expired', details: null, hint: null };
const SCORE_RPC = { name: 'ringside_update_entry', fields: { result_status: 'qualified' } };

function signIn(userId: string, options: { anonymous?: boolean; claimShow?: string } = {}): string {
  const token = nextToken();
  const session: FakeSession = {
    access_token: token,
    user: {
      id: userId,
      ...(options.anonymous ? { is_anonymous: true } : {}),
      ...(options.claimShow
        ? {
            app_metadata: {
              kind: 'ringside_passcode',
              show_id: options.claimShow,
              ringside_role: 'judge',
            },
          }
        : {}),
    },
  };
  fake.session = session;
  fake.sessionError = null;
  return token;
}

/** `SIGNED_OUT`: auth-js has no session and no error. */
function signOutSession(): void {
  fake.session = null;
  fake.sessionError = null;
}

/** An expired token that cannot refresh: auth-js answers with an error and no session. */
function refreshFails(): void {
  fake.session = null;
  fake.sessionError = new Error('AuthRetryableFetchError');
}

async function queueScore(entryId: string, showId = 'show-x'): Promise<string> {
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
    showId
  );
}

async function readStore(store: string): Promise<PendingMutation[]> {
  const db = await databaseManager.getDatabase('MutationManager');
  return (await db.getAll(store)) as PendingMutation[];
}
/** Rows are keyed by random id; sort by entry so assertions do not depend on it. */
const pending = async () =>
  (await readStore(REPLICATION_STORES.PENDING_MUTATIONS)).sort((a, b) =>
    a.rowId.localeCompare(b.rowId)
  );
const failed = () => readStore(REPLICATION_STORES.FAILED_MUTATIONS);

/** Clear any retry backoff so the next pass tries every queued mutation again. */
async function clearBackoff(): Promise<void> {
  const db = await databaseManager.getDatabase('MutationManager');
  for (const row of await pending()) {
    const { nextRetryAt: _dropped, ...rest } = row;
    void _dropped;
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, rest);
  }
}

const sentTo = (calls: RpcCall[]) => calls.map(call => [call.token, call.args.p_entry_id]);

beforeEach(async () => {
  await databaseManager.reset();
  fake.session = null;
  fake.sessionError = null;
  fake.rpcCalls = [];
  fake.rpcAnswer = null;
  fake.persistedUserId = null;
  setDeviceOnline(true);
});

afterEach(async () => {
  mutationManager.destroy();
  await databaseManager.reset();
});

describe('A. the session dies with scores queued: the queue is kept', () => {
  it('keeps every score when the token cannot refresh (no session, error)', async () => {
    signIn('judge-1');
    await queueScore('e1');
    await queueScore('e2');

    refreshFails();
    await expect(mutationManager.uploadPendingMutations()).rejects.toThrow(
      'AuthRetryableFetchError'
    );

    const rows = await pending();
    expect(rows.map(row => row.rowId).sort()).toEqual(['e1', 'e2']);
    expect(rows.every(row => row.authUserId === 'judge-1' && row.retries === 0)).toBe(true);
    expect(await failed()).toEqual([]);
    expect(fake.rpcCalls).toEqual([]);
  });

  // The NEXT score, with the token expired and no network (MYK9-1204): queue
  // ownership falls back to the persisted account's id, so it is taken. Only
  // with no account persisted is it refused. Upload still needs a live session.
  it('queues a NEW score under the persisted account while the session cannot resolve', async () => {
    signIn('judge-1');
    await queueScore('e1');

    refreshFails();
    fake.persistedUserId = 'judge-1';
    await queueScore('e2');

    expect((await pending()).map(row => [row.rowId, row.authUserId])).toEqual([
      ['e1', 'judge-1'],
      ['e2', 'judge-1'],
    ]);
    expect(fake.rpcCalls).toEqual([]);
  });

  it('refuses to queue a NEW score only when no account is persisted, leaving the queued ones intact', async () => {
    signIn('judge-1');
    await queueScore('e1');

    refreshFails();
    await expect(queueScore('e2')).rejects.toThrow('AuthRetryableFetchError');

    expect((await pending()).map(row => row.rowId)).toEqual(['e1']);
  });

  it('keeps every score after SIGNED_OUT (no session, no error)', async () => {
    signIn('judge-1');
    await queueScore('e1');

    signOutSession();
    await expect(mutationManager.uploadPendingMutations()).rejects.toThrow(
      /bound authenticated session/
    );

    const rows = await pending();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rowId: 'e1', authUserId: 'judge-1', retries: 0 });
    expect(fake.rpcCalls).toEqual([]);
  });

  it('keeps a score the server refuses with "JWT expired", through the retry budget, in the failed store', async () => {
    signIn('judge-1');
    await queueScore('e1');
    fake.rpcAnswer = () => ({ data: null, error: JWT_EXPIRED });

    await mutationManager.uploadPendingMutations();
    expect(await pending()).toMatchObject([{ rowId: 'e1', retries: 1, status: 'pending' }]);
    expect(await failed()).toEqual([]);

    for (let pass = 0; pass < 2; pass++) {
      await clearBackoff();
      await mutationManager.uploadPendingMutations();
    }

    // Three "JWT expired" (PGRST301) answers, retried as transient, dead-letter the score (it is NOT deleted): it sits in
    // failed_mutations, owned by judge-1, until a person retries it.
    expect(await pending()).toEqual([]);
    expect(await failed()).toMatchObject([
      { rowId: 'e1', authUserId: 'judge-1', failureKind: 'max-retries' },
    ]);

    // Fresh token, same judge: Retry puts it back and it uploads.
    fake.rpcAnswer = null;
    const token = signIn('judge-1');
    await mutationManager.retryFailedMutation((await failed())[0].id);
    await mutationManager.uploadPendingMutations();
    expect(await pending()).toEqual([]);
    expect(await failed()).toEqual([]);
    expect(fake.rpcCalls.at(-1)).toMatchObject({ token });
  });
});

describe('B. the same user signs back in: the queue flushes under that identity', () => {
  it('flushes every queued score, in order, on the NEW token', async () => {
    const oldToken = signIn('judge-1');
    await queueScore('e1');
    await queueScore('e2');
    await queueScore('e3');

    signOutSession();
    await expect(mutationManager.uploadPendingMutations()).rejects.toThrow();
    expect(await pending()).toHaveLength(3);

    const newToken = signIn('judge-1');
    await mutationManager.uploadPendingMutations();

    expect(await pending()).toEqual([]);
    expect(await failed()).toEqual([]);
    expect(sentTo(fake.rpcCalls)).toEqual([
      [newToken, 'e1'],
      [newToken, 'e2'],
      [newToken, 'e3'],
    ]);
    expect(fake.rpcCalls.some(call => call.token === oldToken)).toBe(false);
  });

  it('recovers when the refresh error clears without a sign-out', async () => {
    signIn('judge-1');
    await queueScore('e1');
    refreshFails();
    await expect(mutationManager.uploadPendingMutations()).rejects.toThrow();

    const token = signIn('judge-1');
    await mutationManager.uploadPendingMutations();

    expect(await pending()).toEqual([]);
    expect(sentTo(fake.rpcCalls)).toEqual([[token, 'e1']]);
  });
});

describe('C. a different user signs in: the queue is never sent as them', () => {
  it('holds judge-1 scores while judge-2 is signed in, then flushes them for judge-1', async () => {
    signIn('judge-1');
    await queueScore('e1');
    await queueScore('e2');

    signOutSession();
    const otherToken = signIn('judge-2');
    await mutationManager.uploadPendingMutations();

    expect(fake.rpcCalls).toEqual([]);
    const held = await pending();
    expect(held.map(row => [row.rowId, row.authUserId, row.retries])).toEqual([
      ['e1', 'judge-1', 0],
      ['e2', 'judge-1', 0],
    ]);
    expect(await failed()).toEqual([]);
    // The device still reports them as waiting, so the UI does not claim "all saved".
    expect(await mutationManager.getPendingCount()).toBe(2);

    // judge-2's own work is not blocked by judge-1's, and goes out on judge-2's token.
    await queueScore('e9');
    await mutationManager.uploadPendingMutations();
    expect(sentTo(fake.rpcCalls)).toEqual([[otherToken, 'e9']]);
    expect((await pending()).map(row => row.rowId)).toEqual(['e1', 'e2']);

    // judge-1 returns: theirs flush, on their token.
    signOutSession();
    const ownerToken = signIn('judge-1');
    await mutationManager.uploadPendingMutations();
    expect(await pending()).toEqual([]);
    expect(sentTo(fake.rpcCalls).slice(1)).toEqual([
      [ownerToken, 'e1'],
      [ownerToken, 'e2'],
    ]);
  });

  it('does not let the other user retry, discard or clear judge-1 dead letters or queue', async () => {
    signIn('judge-1');
    await queueScore('e1');
    fake.rpcAnswer = () => ({ data: null, error: { code: '42501', message: 'permission denied' } });
    await mutationManager.uploadPendingMutations();
    const deadLetter = (await failed())[0];
    await queueScore('e2');

    signOutSession();
    signIn('judge-2');
    await mutationManager.retryFailedMutation(deadLetter.id);
    await mutationManager.discardFailedMutation(deadLetter.id);
    await mutationManager.clearAllMutations();

    expect((await failed()).map(row => row.id)).toEqual([deadLetter.id]);
    expect((await pending()).map(row => row.rowId)).toEqual(['e2']);
  });
});

describe('D. passcode ringside (anonymous session with a show claim)', () => {
  it('flushes on a refreshed anonymous session that keeps the same user id', async () => {
    signIn('anon-1', { anonymous: true });
    await queueScore('e1');

    refreshFails();
    await expect(mutationManager.uploadPendingMutations()).rejects.toThrow();
    expect(await pending()).toHaveLength(1);

    const token = signIn('anon-1', { anonymous: true });
    await mutationManager.uploadPendingMutations();
    expect(await pending()).toEqual([]);
    expect(sentTo(fake.rpcCalls)).toEqual([[token, 'e1']]);
  });

  it('keeps scores queued when the anonymous session ends (SIGNED_OUT)', async () => {
    signIn('anon-1', { anonymous: true });
    await queueScore('e1');
    await queueScore('e2');

    signOutSession();
    await expect(mutationManager.uploadPendingMutations()).rejects.toThrow();

    expect((await pending()).map(row => [row.rowId, row.authUserId])).toEqual([
      ['e1', 'anon-1'],
      ['e2', 'anon-1'],
    ]);
    expect(await failed()).toEqual([]);
  });

  // An anonymous user cannot be signed back in: passcode re-entry mints a NEW
  // user (`signInAnonymously` in pages/ringsideAnonSession.ts). Owner isolation
  // holds the old user's queue; it is kept and counted, never sent as anon-2,
  // until the owner says yes to adopting it (MYK9-1205, below).
  it('holds scores queued under a dead anonymous user when the passcode is re-entered as a new one', async () => {
    signIn('anon-1', { anonymous: true, claimShow: 'show-x' });
    await queueScore('e1');

    signOutSession();
    const token = signIn('anon-2', { anonymous: true, claimShow: 'show-x' });
    // Positive control: anon-2's own score goes out on this same setup.
    await queueScore('e2');
    await mutationManager.uploadPendingMutations();
    await mutationManager.uploadPendingMutations();

    expect(sentTo(fake.rpcCalls)).toEqual([[token, 'e2']]);
    expect(await pending()).toMatchObject([{ rowId: 'e1', authUserId: 'anon-1', retries: 0 }]);
    expect(await mutationManager.getPendingCount()).toBe(1);
    expect(await mutationManager.getFailedMutations()).toEqual([]);
  });
});

describe('E. a fresh passcode session adopts held scores for the same show, after a yes (MYK9-1205)', () => {
  /** anon-1 (show-x claim) queues e1 + e2 (show-x) and e3 (show-y); a signed-in judge queues e4 (show-x). */
  async function strandQueueThenReenterPasscode(claimShow = 'show-x'): Promise<string> {
    signIn('anon-1', { anonymous: true, claimShow: 'show-x' });
    await queueScore('e1');
    await queueScore('e2');
    await queueScore('e3', 'show-y');
    signOutSession();
    signIn('judge-1');
    await queueScore('e4');
    signOutSession();
    return signIn('anon-2', { anonymous: true, claimShow });
  }
  const ownerOf = async () =>
    Object.fromEntries((await pending()).map(row => [row.rowId, row.authUserId]));

  it('counts only anonymous-owned scores for the claimed show, and sends nothing before a yes', async () => {
    await strandQueueThenReenterPasscode();

    expect(await countHeldRingsideScores()).toBe(2);
    await mutationManager.uploadPendingMutations();

    expect(fake.rpcCalls).toEqual([]);
    expect(await ownerOf()).toEqual({ e1: 'anon-1', e2: 'anon-1', e3: 'anon-1', e4: 'judge-1' });
    expect(await mutationManager.getPendingCount()).toBe(4);
  });

  it('uploads the adopted scores on the NEW token after a yes; other shows and signed-in owners stay held', async () => {
    const token = await strandQueueThenReenterPasscode();

    expect(await adoptHeldRingsideScores()).toBe(2);
    await mutationManager.uploadPendingMutations();

    expect(sentTo(fake.rpcCalls)).toEqual([
      [token, 'e1'],
      [token, 'e2'],
    ]);
    expect(await ownerOf()).toEqual({ e3: 'anon-1', e4: 'judge-1' });
    expect(await countHeldRingsideScores()).toBe(0);
    expect(await failed()).toEqual([]);
  });

  it('leaves everything held and counted after a no, and can still be offered later', async () => {
    await strandQueueThenReenterPasscode();

    // No adopt call: that is "Not now". Held, visible, and still offerable.
    await mutationManager.uploadPendingMutations();
    expect(fake.rpcCalls).toEqual([]);
    expect(await countHeldRingsideScores()).toBe(2);
    expect(await ownerOf()).toEqual({ e1: 'anon-1', e2: 'anon-1', e3: 'anon-1', e4: 'judge-1' });

    // Changing their mind later (the banner's Review) still works.
    expect(await adoptHeldRingsideScores()).toBe(2);
  });

  it('adopts for the show the NEW claim covers, never another', async () => {
    const token = await strandQueueThenReenterPasscode('show-y');

    expect(await countHeldRingsideScores()).toBe(1);
    expect(await adoptHeldRingsideScores()).toBe(1);
    await mutationManager.uploadPendingMutations();

    expect(sentTo(fake.rpcCalls)).toEqual([[token, 'e3']]);
    expect(await ownerOf()).toEqual({ e1: 'anon-1', e2: 'anon-1', e4: 'judge-1' });
  });

  it('adopts nothing for a signed-in account, even one holding the same show', async () => {
    await strandQueueThenReenterPasscode();
    signOutSession();
    signIn('judge-2');

    expect(await countHeldRingsideScores()).toBe(0);
    expect(await adoptHeldRingsideScores()).toBe(0);
    expect(await ownerOf()).toEqual({ e1: 'anon-1', e2: 'anon-1', e3: 'anon-1', e4: 'judge-1' });
  });

  it('never adopts a row queued before the stamps existed, a dead letter, or a non-ringside mutation', async () => {
    const token = await strandQueueThenReenterPasscode();
    const db = await databaseManager.getDatabase('MutationManager');
    const [e1, e2] = await pending();
    // e1 predates the stamps; e2 is a direct (non-RPC) write.
    const { ownerIsAnonymous: _o, showId: _s, ...legacy } = e1;
    void _o;
    void _s;
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, legacy);
    const { rpc: _r, ...direct } = e2;
    void _r;
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, direct);
    await db.put(REPLICATION_STORES.FAILED_MUTATIONS, {
      ...e1,
      id: 'dead-letter',
      status: 'failed',
      ownerIsAnonymous: true,
      showId: 'show-x',
    });

    expect(await adoptHeldRingsideScores()).toBe(0);
    expect(fake.rpcCalls.filter(call => call.token === token)).toEqual([]);
    expect((await failed()).map(row => [row.id, row.authUserId])).toEqual([
      ['dead-letter', 'anon-1'],
    ]);
  });

  it("does not count the new session's own scores, a different RPC, or a row not in the pending state", async () => {
    await strandQueueThenReenterPasscode();
    await queueScore('own');
    const db = await databaseManager.getDatabase('MutationManager');
    const rows = await pending();
    const e1 = rows.find(row => row.rowId === 'e1') as PendingMutation;
    const e2 = rows.find(row => row.rowId === 'e2') as PendingMutation;
    // e1 is a ringside-looking write to some OTHER function; e2 is not in the pending state.
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, {
      ...e1,
      rpc: { name: 'mark_classes_judge_signed_off', args: {} },
    });
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, { ...e2, status: 'failed' });

    expect(await countHeldRingsideScores()).toBe(0);
    expect(await adoptHeldRingsideScores()).toBe(0);
  });
});
