/**
 * `diagnose_payment` — payment state for an entry or a Stripe reference.
 *
 * Two schema traps the queries respect:
 *  - `stripe_orders.entry_ids` is a `uuid[]`; entry lookups use array
 *    containment (`.contains`), not scalar equality.
 *  - `amount_cents` is integer cents; every displayed amount is `/100`.
 *
 * An entry marked `paid` with no matching Stripe order is flagged (not failed) —
 * mail/check/manual payment is valid.
 */
import type { AdminToolDefinition } from '../mcp/server';
import type { ToolContext } from '../tools/index';
import {
  diagnosePaymentInput,
  type DiagnosePaymentInput,
} from '../tools/schemas';
import { buildEntryManagementLink } from './links';
import { shortenProviderId } from './redaction';
import type { DiagnosticEvidence, DiagnosticResult } from './types';
import { createDiagnosticResult } from './types';

interface OrderRow {
  id: string;
  status: string | null;
  amount_cents: number;
  currency: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  entry_ids: string[] | null;
  show_id: string | null;
  order_type: string | null;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
}

const ORDER_SELECT =
  'id, status, amount_cents, currency, paid_at, refunded_at, entry_ids, ' +
  'show_id, order_type, stripe_payment_intent_id, stripe_checkout_session_id';

function formatAmount(cents: number, currency: string | null): string {
  return `${(cents / 100).toFixed(2)} ${(currency ?? 'usd').toUpperCase()}`;
}

function orderEvidence(order: OrderRow): DiagnosticEvidence[] {
  return [
    { label: 'Order status', value: order.status, source: 'stripe_orders.status' },
    {
      label: 'Amount',
      value: formatAmount(order.amount_cents, order.currency),
      source: 'stripe_orders.amount_cents',
    },
    { label: 'Paid at', value: order.paid_at, source: 'stripe_orders.paid_at' },
    {
      label: 'Refunded at',
      value: order.refunded_at,
      source: 'stripe_orders.refunded_at',
    },
    {
      label: 'Linked entry count',
      value: (order.entry_ids ?? []).length,
      source: 'stripe_orders.entry_ids',
    },
    {
      label: 'Payment intent',
      value: shortenProviderId(order.stripe_payment_intent_id),
      source: 'stripe_orders.stripe_payment_intent_id',
    },
    {
      label: 'Checkout session',
      value: shortenProviderId(order.stripe_checkout_session_id),
      source: 'stripe_orders.stripe_checkout_session_id',
    },
  ];
}

export async function diagnosePayment(
  input: DiagnosePaymentInput,
  ctx: ToolContext,
): Promise<DiagnosticResult> {
  const { config, supabase } = ctx;
  const { entryId, paymentIntentId, checkoutSessionId } = input;

  let entryPaymentStatus: string | null = null;
  let entryShowId: string | null = null;
  if (entryId) {
    const entry = await supabase
      .from('entries')
      .select('id, payment_status, show_id')
      .eq('id', entryId)
      .maybeSingle();
    if (entry.error) {
      return createDiagnosticResult(config.envLabel, 'source_unavailable', {
        limitations: ['Could not read the entry record.'],
      });
    }
    if (!entry.data) {
      return createDiagnosticResult(config.envLabel, 'not_found', {
        summary: { entryId },
        limitations: [`No entry found for id ${entryId}.`],
      });
    }
    entryPaymentStatus = entry.data.payment_status;
    entryShowId = entry.data.show_id;
  }

  const base = supabase.from('stripe_orders').select(ORDER_SELECT);
  const filtered = entryId
    ? base.contains('entry_ids', [entryId]) // uuid[] containment, not eq
    : paymentIntentId
      ? base.eq('stripe_payment_intent_id', paymentIntentId)
      : base.eq('stripe_checkout_session_id', checkoutSessionId ?? '');
  const orders = await filtered.returns<OrderRow[]>();
  if (orders.error) {
    return createDiagnosticResult(config.envLabel, 'source_unavailable', {
      limitations: ['Could not read Stripe orders.'],
    });
  }
  const rows = orders.data ?? [];

  const entryStatusEvidence: DiagnosticEvidence[] =
    entryPaymentStatus !== null
      ? [
          {
            label: 'Entry payment status',
            value: entryPaymentStatus,
            source: 'entries.payment_status',
          },
        ]
      : [];
  const links = entryShowId
    ? [buildEntryManagementLink(config, entryShowId)]
    : [];

  if (rows.length > 1) {
    return createDiagnosticResult(config.envLabel, 'ambiguous', {
      summary: { matchCount: rows.length },
      evidence: [
        ...entryStatusEvidence,
        ...rows.map(
          (order, index): DiagnosticEvidence => ({
            label: `Order ${index + 1}`,
            value: `${order.status ?? 'unknown'} · ${formatAmount(order.amount_cents, order.currency)}`,
            source: 'stripe_orders',
          }),
        ),
      ],
      links,
      limitations: [
        'Multiple Stripe orders matched; narrow by a specific payment intent or checkout session id.',
      ],
    });
  }

  if (rows.length === 0) {
    const limitations =
      entryId && entryPaymentStatus === 'paid'
        ? [
            'Entry is marked paid but has no matching Stripe order — mail, check, or manual payment can be valid.',
          ]
        : ['No Stripe order matched the provided identifier.'];
    // For an entry, "no online order" is still a complete answer (found);
    // for a raw provider id with no match, it's not_found.
    return createDiagnosticResult(config.envLabel, entryId ? 'found' : 'not_found', {
      summary: { entryId: entryId ?? null, entryPaymentStatus, onlineOrderFound: false },
      evidence: entryStatusEvidence,
      links,
      limitations,
    });
  }

  const order = rows[0] as OrderRow;
  return createDiagnosticResult(config.envLabel, 'found', {
    summary: {
      entryId: entryId ?? null,
      entryPaymentStatus,
      orderStatus: order.status,
      amount: formatAmount(order.amount_cents, order.currency),
      onlineOrderFound: true,
    },
    evidence: [...entryStatusEvidence, ...orderEvidence(order)],
    links,
    limitations: [],
  });
}

export function diagnosePaymentTool(ctx: ToolContext): AdminToolDefinition {
  return {
    name: 'diagnose_payment',
    description:
      'Diagnose the payment state for an entry (by entry id) or a Stripe ' +
      'payment intent / checkout session id. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        entryId: { type: 'string', description: 'Entry UUID' },
        paymentIntentId: { type: 'string', description: 'Stripe payment intent id' },
        checkoutSessionId: {
          type: 'string',
          description: 'Stripe checkout session id',
        },
      },
      additionalProperties: false,
    },
    parseInput: (raw) => diagnosePaymentInput.parse(raw),
    handle: (input) => diagnosePayment(input as DiagnosePaymentInput, ctx),
  };
}
