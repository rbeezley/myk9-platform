import type { EmailDeliveryRpcRow } from './readModel';

export interface EmailDeliveryCursor {
  createdAt: string;
  id: string;
}

export interface EmailDeliveryHistoryPage {
  rows: EmailDeliveryRpcRow[];
  nextCursor: EmailDeliveryCursor | null;
}

interface RpcResult<T> {
  data: T | null;
  error: { message?: string } | null;
}

export interface EmailDeliverySupabaseClient {
  rpc<T = unknown>(name: string, args: Record<string, unknown>): PromiseLike<RpcResult<T>>;
}

export async function fetchShowEmailDeliveryHistory(args: {
  supabase: EmailDeliverySupabaseClient;
  showId: string;
  limit?: number;
  cursor?: EmailDeliveryCursor | null;
}): Promise<EmailDeliveryHistoryPage> {
  const limit = args.limit ?? 50;
  const result = await args.supabase.rpc<EmailDeliveryRpcRow[]>('get_show_email_delivery_history', {
    p_show_id: args.showId,
    p_limit: limit,
    p_before_created_at: args.cursor?.createdAt ?? null,
    p_before_id: args.cursor?.id ?? null,
  });

  if (result.error) {
    throw new Error(result.error.message ?? 'Email delivery history is unavailable');
  }

  const rows = result.data ?? [];
  const pageRows = rows.slice(0, limit);
  const lastRow = pageRows[pageRows.length - 1];
  return {
    rows: pageRows,
    nextCursor:
      rows.length > limit && lastRow ? { createdAt: lastRow.attempted_at, id: lastRow.id } : null,
  };
}
