export type RefundLedgerAction = 'book' | 'fail' | 'cancel' | 'defer';

export function resolveRefundLedgerAction(status: string | null | undefined): RefundLedgerAction {
  switch (status) {
    case 'succeeded':
      return 'book';
    case 'failed':
      return 'fail';
    case 'canceled':
      return 'cancel';
    default:
      return 'defer';
  }
}

interface RefundListItem {
  id: string;
}

interface RefundListPage<TRefund extends RefundListItem> {
  data: TRefund[];
  has_more: boolean;
}

interface RefundListParams {
  charge: string;
  limit: number;
  starting_after?: string;
}

type RefundPageLoader<TRefund extends RefundListItem> = (
  params: RefundListParams
) => Promise<RefundListPage<TRefund>>;

export async function listAllChargeRefunds<TRefund extends RefundListItem>(
  chargeId: string,
  listPage: RefundPageLoader<TRefund>,
  pageSize = 100
): Promise<TRefund[]> {
  const refunds: TRefund[] = [];
  let startingAfter: string | undefined;

  while (true) {
    const page = await listPage({
      charge: chargeId,
      limit: pageSize,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    refunds.push(...page.data);

    if (!page.has_more) return refunds;

    const lastRefund = page.data.at(-1);
    if (!lastRefund) {
      throw new Error(`Stripe reported has_more with an empty page for charge ${chargeId}`);
    }
    startingAfter = lastRefund.id;
  }
}
