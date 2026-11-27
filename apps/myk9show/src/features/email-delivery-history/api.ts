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
  error: { message?: string; code?: string } | null;
}

export interface EmailDeliverySupabaseClient {
  rpc<T = unknown>(name: string, args: Record<string, unknown>): PromiseLike<RpcResult<T>>;
}

export async function fetchShowEmailDeliveryHistory(args: {
  supabase: EmailDeliverySupabaseClient;
  showId: string;
  limit?: number;
  cursor?: EmailDeliveryCursor | null;
  /** MYK9-2403: narrow to one address (the entry form's exhibitor); omitted, the whole show. */
  recipientEmail?: string | null;
}): Promise<EmailDeliveryHistoryPage> {
  const limit = args.limit ?? 50;
  const result = await args.supabase.rpc<EmailDeliveryRpcRow[]>('get_show_email_delivery_history', {
    p_show_id: args.showId,
    p_limit: limit,
    p_before_created_at: args.cursor?.createdAt ?? null,
    p_before_id: args.cursor?.id ?? null,
    // Left out when unset so the Messages list sends exactly what it always has.
    ...(args.recipientEmail ? { p_recipient_email: args.recipientEmail } : {}),
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

export interface ShowEmailContent {
  subject: string;
  html: string;
}

/** The text of one sent email, or null when no copy was kept (MYK9-2115). */
export async function fetchShowEmailContent(args: {
  supabase: EmailDeliverySupabaseClient;
  emailLogId: string;
}): Promise<ShowEmailContent | null> {
  const result = await args.supabase.rpc<ShowEmailContent[]>('get_show_email_content', {
    p_email_log_id: args.emailLogId,
  });
  if (result.error) {
    throw Object.assign(new Error(result.error.message ?? 'This email is unavailable'), {
      code: result.error.code,
    });
  }
  return result.data?.[0] ?? null;
}
