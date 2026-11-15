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

/** What one Delivery history row's email said (MYK9-1999). */
export interface EmailContent {
  subject: string | null;
  /** The HTML that was sent; null for an email recorded only as text, or before MYK9-1999. */
  bodyHtml: string | null;
  /** A lifecycle email's rendered text, when it has no HTML. */
  bodyText: string | null;
}

interface EmailContentRpcRow {
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
}

export async function fetchShowEmailContent(args: {
  supabase: EmailDeliverySupabaseClient;
  emailLogId: string;
}): Promise<EmailContent | null> {
  const result = await args.supabase.rpc<EmailContentRpcRow[]>('get_show_email_content', {
    p_email_log_id: args.emailLogId,
  });
  if (result.error) {
    throw new Error(result.error.message ?? 'This email is unavailable');
  }
  const row = result.data?.[0];
  if (!row) return null;
  return { subject: row.subject, bodyHtml: row.body_html, bodyText: row.body_text };
}
