// In-memory refund_requests + refund_request_attempts and Stripe refunds for
// refundApproval.test.ts. The rpc fake mirrors the SQL contract of
// 20261003013900 (begin_refund_attempt, record_refund_attempt,
// refund_attempt_version, settle_refund_attempt with their version
// compare-and-set, and the trigger-derived request status); the SQL
// itself is covered by supabase/tests/myk9_876_874_refund_request_claims_test.sql
// (CI only).
import type { ApprovalRefund, RefundApprovalDeps } from './refundApproval';
import type { AttemptStatus, SettleDeps, SettlingRefund } from './refundRequests';

export interface FakeAttempt {
  id: string;
  attemptNo: number;
  refundId: string | null;
  status: AttemptStatus;
  failureReason: string | null;
  /** Compare-and-set token (Codex round 3): bumped by every write. */
  version: number;
}

export function harness(
  opts: {
    fulfilled?: boolean;
    createStatus?: string;
    createThrows?: boolean;
    pageSize?: number;
  } = {}
) {
  const attempts: FakeAttempt[] = [];
  const stripeRefunds: ApprovalRefund[] = [];
  const byKey = new Map<string, ApprovalRefund>();
  const created: { key: string; metadata: Record<string, string>; amount: number }[] = [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const alerts: string[] = [];
  const pageRequests: (string | undefined)[] = [];
  let createThrows = opts.createThrows ?? false;
  let createStatus = opts.createStatus ?? 'succeeded';

  const nextStatus = (current: AttemptStatus, reported: AttemptStatus) =>
    reported === 'pending' && current !== 'pending' ? current : reported;
  const isDead = (s: AttemptStatus) => s === 'failed' || s === 'canceled';

  function requestState(): { status: string; lastFailure: string | null } {
    if (attempts.some(a => a.status === 'succeeded'))
      return { status: 'refunded', lastFailure: null };
    if (attempts.some(a => a.status === 'pending'))
      return { status: 'awaiting_stripe', lastFailure: null };
    const latest = [...attempts].sort((x, y) => y.attemptNo - x.attemptNo)[0];
    if (latest && isDead(latest.status)) {
      return {
        status: 'failed',
        lastFailure: `${latest.status}: ${latest.failureReason ?? 'no reason given'}`,
      };
    }
    return { status: 'pending', lastFailure: null };
  }

  const beginRow = (outcome: string, attempt: FakeAttempt | null) => ({
    outcome,
    attempt_id: attempt?.id ?? null,
    attempt_no: attempt?.attemptNo ?? null,
    stripe_refund_id: attempt?.refundId ?? null,
    attempt_version: attempt?.version ?? null,
    kind: 'abandoned_cart',
    stripe_payment_intent_id: 'pi_1',
    stripe_checkout_session_id: 'cs_1',
    amount_cents: 4200,
    reason: 'cart_abandoned',
  });

  const rpc: RefundApprovalDeps['rpc'] = async (fn, args) => {
    rpcCalls.push({ fn, args });
    if (fn === 'begin_refund_attempt') {
      const succeeded = attempts.find(a => a.status === 'succeeded');
      if (succeeded) return { data: [beginRow('already_refunded', succeeded)], error: null };
      if (opts.fulfilled) return { data: [beginRow('fulfilled', null)], error: null };
      const pending = attempts.find(a => a.status === 'pending');
      if (pending) return { data: [beginRow('resume', pending)], error: null };
      const attempt: FakeAttempt = {
        id: `att-${attempts.length + 1}`,
        attemptNo: attempts.length + 1,
        refundId: null,
        status: 'pending',
        failureReason: null,
        version: 1,
      };
      attempts.push(attempt);
      return { data: [beginRow('claimed', attempt)], error: null };
    }
    if (fn === 'record_refund_attempt') {
      const attempt = attempts.find(a => a.id === args.p_attempt_id);
      if (!attempt) return { data: [{ outcome: 'not_found' }], error: null };
      const row = (outcome: string) => ({
        data: [
          {
            outcome,
            attempt_status: attempt.status,
            stripe_refund_id: attempt.refundId,
            attempt_version: attempt.version,
          },
        ],
        error: null,
      });
      if (attempts.some(a => a.refundId === args.p_stripe_refund_id && a.id !== attempt.id)) {
        return row('refund_on_other_attempt');
      }
      if (attempt.version !== args.p_expected_version) return row('conflict');
      if (attempt.refundId !== null || attempt.status !== 'pending') return row('already_recorded');
      attempt.refundId = args.p_stripe_refund_id as string;
      attempt.status = args.p_status as AttemptStatus;
      attempt.failureReason = isDead(attempt.status)
        ? ((args.p_failure_reason as string | null) ?? null)
        : null;
      attempt.version += 1;
      return row('recorded');
    }
    if (fn === 'refund_attempt_version') {
      const attempt = attempts.find(a => a.refundId === args.p_stripe_refund_id);
      return { data: attempt ? attempt.version : null, error: null };
    }
    if (fn === 'settle_refund_attempt') {
      const attempt = attempts.find(a => a.refundId === args.p_stripe_refund_id);
      if (!attempt) return { data: [{ outcome: 'not_found' }], error: null };
      let status = nextStatus(attempt.status, args.p_status as AttemptStatus);
      let outcome: string;
      if (attempt.version !== args.p_expected_version) {
        outcome = 'conflict';
        status = attempt.status;
      } else if (status === attempt.status) {
        outcome = 'unchanged';
      } else {
        outcome = 'updated';
        attempt.status = status;
        attempt.failureReason = isDead(status)
          ? ((args.p_failure_reason as string | null) ?? attempt.failureReason)
          : null;
        attempt.version += 1;
      }
      return {
        data: [
          {
            outcome,
            request_id: 'rr-1',
            attempt_status: status,
            request_status: requestState().status,
            live_attempts: attempts.filter(a => a.status === 'pending' || a.status === 'succeeded')
              .length,
            attempt_version: attempt.version,
          },
        ],
        error: null,
      };
    }
    return { data: [], error: null };
  };

  const alertAdmin: RefundApprovalDeps['alertAdmin'] = async title => {
    alerts.push(title);
  };

  const deps: RefundApprovalDeps = {
    rpc,
    alertAdmin,
    // Stripe lists newest first, a page at a time.
    listRefundsPage: async ({ starting_after }) => {
      pageRequests.push(starting_after);
      const newestFirst = [...stripeRefunds].reverse();
      const start = starting_after ? newestFirst.findIndex(r => r.id === starting_after) + 1 : 0;
      const size = opts.pageSize ?? 100;
      return {
        data: newestFirst.slice(start, start + size),
        has_more: start + size < newestFirst.length,
      };
    },
    createRefund: async (params, key) => {
      if (createThrows) throw new Error('card_declined');
      // Stripe idempotency: the same key returns the same refund.
      const prior = byKey.get(key);
      if (prior) return prior;
      const refund = {
        id: `re_${created.length + 1}`,
        amount: params.amount,
        status: createStatus,
        metadata: params.metadata,
      };
      created.push({ key, metadata: params.metadata, amount: params.amount });
      stripeRefunds.push(refund);
      byKey.set(key, refund);
      return refund;
    },
  };

  /** The webhook's deps: retrieve returns Stripe's CURRENT copy of a refund. */
  const settleDeps: SettleDeps = {
    rpc,
    alertAdmin,
    retrieveRefund: async id => {
      const found = stripeRefunds.find(r => r.id === id);
      if (!found) throw new Error(`No such refund: ${id}`);
      return { ...found } as SettlingRefund;
    },
  };

  /** Stripe changes a refund's state (the event may arrive later, or never). */
  function stripeSets(refundId: string, status: string, failureReason?: string) {
    const refund = stripeRefunds.find(r => r.id === refundId);
    if (!refund) throw new Error(`No such refund: ${refundId}`);
    refund.status = status;
    if (failureReason) refund.failure_reason = failureReason;
    return { ...refund } as SettlingRefund;
  }

  return {
    deps,
    settleDeps,
    attempts,
    created,
    rpcCalls,
    alerts,
    stripeRefunds,
    pageRequests,
    requestState,
    stripeSets,
    setCreateThrows: (v: boolean) => {
      createThrows = v;
    },
    setCreateStatus: (v: string) => {
      createStatus = v;
    },
  };
}
