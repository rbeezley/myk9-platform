import type { PendingMutation } from '@myk9/replication';
import { logger } from '@/services/LoggingService';
import { defaultDeskPaymentDeps, type DeskPaymentDeps } from './deskPaymentDeps';
import {
  DESK_PAYMENTS_TABLE,
  type DeskPaymentLine,
  type LocalDeskPayment,
} from './deskPaymentTypes';
import { isFriendlyRefusal, RPC_REFUSAL_CODE } from './paymentRefusals';
import { refreshAndAnnounceRecorded } from './deskPaymentEvents';
import type { StoredDeskPayment } from './DeskPaymentsTable';

/** What one ledger check found. `visible` false: an empty read proves nothing. */
export interface LedgerCheck {
  visible: boolean;
  found: ReadonlySet<string>;
  /** When the read began: a refusal after it is not answered by it. */
  startedAt: number;
}

/** The last ledger check, reused for a short while so a busy queue does not re-read it per event. */
export interface LedgerCheckCache {
  key: string;
  at: number;
  result: LedgerCheck | null;
}

const LEDGER_CHECK_REUSE_MS = 30_000;

/** The queue's own prefixes on a dead letter's text, before the server's message. */
const DEAD_LETTER_PREFIX = /^(Non-retryable error|Max retries exceeded): /;

/** The server's own message on a dead letter, without the queue's prefix. */
export function deadLetterMessage(dead: Pick<PendingMutation, 'error'>): string {
  return (dead.error ?? '').replace(DEAD_LETTER_PREFIX, '');
}

/** A refusal's reason in words for the desk; the raw text only when it was written for her. */
export function refusalReason(dead: Pick<PendingMutation, 'error'>): string {
  const message = deadLetterMessage(dead);
  return isFriendlyRefusal(message) ? message : 'something went wrong with this request';
}

/** A send began for it: the dialog's own, or a queued attempt that came back unanswered. */
function sendBegun(payment: LocalDeskPayment, queued: readonly PendingMutation[]): boolean {
  return (
    payment.sendBegun ||
    queued.some(m => (m.retries ?? 0) > 0 || (m.transportRetries ?? 0) > 0 || m.error)
  );
}

/**
 * The line for a payment with no queue row: a dead letter, or (rarely) a record whose
 * queue row is gone. Remove only for a PROVEN refusal: a 22023, a ledger she can read,
 * and a read begun after the refusal with no row for its id.
 */
export function stoppedLine(
  { payment, owner }: Pick<StoredDeskPayment, 'payment' | 'owner'>,
  dead: PendingMutation | undefined,
  check: LedgerCheck | null
): DeskPaymentLine {
  if (!dead) return { payment, owner, state: 'not-checked' };
  if (dead.failureKind === 'max-retries') {
    return { payment, owner, state: 'unconfirmed-stopped', failedMutationId: dead.id };
  }
  const provenRefusal =
    dead.errorCode === RPC_REFUSAL_CODE &&
    check !== null &&
    check.visible &&
    dead.failedAt !== undefined &&
    check.startedAt >= dead.failedAt &&
    !check.found.has(payment.id);
  return provenRefusal
    ? { payment, owner, state: 'refused', failedMutationId: dead.id, reason: refusalReason(dead) }
    : { payment, owner, state: 'not-checked', failedMutationId: dead.id };
}

async function checkLedger(
  showId: string,
  ids: string[],
  deps: DeskPaymentDeps,
  cache: { current: LedgerCheckCache | null } | undefined,
  failedAtKey: string
): Promise<LedgerCheck | null> {
  const key = `${showId}|${failedAtKey}`;
  const reused = cache?.current;
  if (reused && reused.key === key && deps.now() - reused.at < LEDGER_CHECK_REUSE_MS) {
    return reused.result;
  }
  let result: LedgerCheck | null = null;
  if (deps.isOnline()) {
    const startedAt = deps.now();
    try {
      const visible = await deps.canReadLedger(showId);
      const found = visible ? await deps.ledgerIds(ids) : new Set<string>();
      result = { visible, found, startedAt };
    } catch (error) {
      logger.warn('Desk payment ledger check failed', 'secretary', {}, error as Error);
    }
  }
  if (cache) cache.current = { key, at: deps.now(), result };
  return result;
}

/**
 * MYK9-2479: this account's payments for one show that the server has not been proven
 * to hold, each with its state. A payment proven recorded on the way (its upload was
 * acknowledged, or the ledger lists its id) is settled here, and the show's money is
 * refreshed. Reads this device only, except one ledger check when a payment has stopped.
 */
export async function readDeskPaymentLines(
  showId: string,
  deps: DeskPaymentDeps = defaultDeskPaymentDeps,
  cache?: { current: LedgerCheckCache | null }
): Promise<DeskPaymentLine[]> {
  const stored = await deps.table.listForShow(showId);
  if (stored.length === 0) return [];
  const [pending, failed] = await Promise.all([
    deps.queue.getPendingMutationsForTable(DESK_PAYMENTS_TABLE),
    deps.queue.getFailedMutations(),
  ]);
  const queuedFor = (id: string) => pending.filter(m => String(m.rowId) === id);
  const deadFor = (id: string) =>
    failed
      .filter(m => m.tableName === DESK_PAYMENTS_TABLE && String(m.rowId) === id)
      .sort((a, b) => (b.failedAt ?? 0) - (a.failedAt ?? 0))[0];

  const lines: DeskPaymentLine[] = [];
  const proven: StoredDeskPayment[] = [];
  const stopped: Array<{ entry: StoredDeskPayment; dead: PendingMutation | undefined }> = [];
  for (const entry of stored) {
    const { payment, owner } = entry;
    const queued = queuedFor(payment.id);
    if (entry.acknowledged) proven.push(entry);
    else if (queued.length > 0) {
      const state = sendBegun(payment, queued) ? 'unconfirmed' : 'waiting';
      lines.push({ payment, owner, state });
    } else stopped.push({ entry, dead: deadFor(payment.id) });
  }

  if (stopped.length > 0) {
    const failedAtKey = stopped
      .map(s => `${s.entry.payment.id}:${s.dead?.failedAt ?? ''}`)
      .join(',');
    const ids = stopped.map(s => s.entry.payment.id);
    const check = await checkLedger(showId, ids, deps, cache, failedAtKey);
    for (const { entry, dead } of stopped) {
      if (check?.found.has(entry.payment.id)) proven.push(entry);
      else lines.push(stoppedLine(entry, dead, check));
    }
  }

  if (proven.length > 0) {
    // Settled for the account that saved each one; `not-owner` settled nothing and moved
    // no money, so only a real settle is announced.
    const settled = await Promise.allSettled(
      proven.map(({ payment, owner }) => deps.table.settle(payment.id, owner))
    );
    const recorded = proven.flatMap(({ payment }, i) => {
      const outcome = settled[i];
      return outcome?.status === 'fulfilled' && outcome.value === 'settled' ? [payment] : [];
    });
    if (recorded.length > 0) await refreshAndAnnounceRecorded(recorded, deps.refreshEntries);
  }
  return lines.sort((a, b) => a.payment.receivedAt.localeCompare(b.payment.receivedAt));
}

/**
 * Try again: the same mutation and id (`retryFailedMutation`). A record whose queue row
 * is gone is queued again from itself, still under its own id: no path mints a new one.
 */
export async function retryDeskPayment(
  line: DeskPaymentLine,
  deps: DeskPaymentDeps = defaultDeskPaymentDeps
): Promise<void> {
  if (line.state === 'waiting' || line.state === 'unconfirmed' || line.state === 'refused') return;
  // It was sent before, so once queued again it reads "not confirmed", never "waiting".
  await deps.table.markSendBegun(line.payment.id);
  if (line.failedMutationId) await deps.queue.retryFailedMutation(line.failedMutationId);
  else await deps.table.queuePayment({ ...line.payment, sendBegun: true });
}

/** Remove: only a proven refusal, which the server never recorded. */
export async function removeRefusedDeskPayment(
  line: DeskPaymentLine,
  deps: DeskPaymentDeps = defaultDeskPaymentDeps
): Promise<void> {
  if (line.state !== 'refused') return;
  // Another account signed in since the read: nothing is removed, and the next read says so.
  await deps.table.settle(line.payment.id, line.owner);
}
