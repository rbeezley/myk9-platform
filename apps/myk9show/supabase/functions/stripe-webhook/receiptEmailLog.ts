// MYK9-2408: logs the card receipt to email_log and keeps a copy of what it said, so
// Delivery history's "View email" (get_show_email_content) can open it.
import { storeEmailContent, type EmailContentClient } from '../_shared/emailLogContent.ts';

interface EmailLogInsertClient extends EmailContentClient {
  from(table: string): {
    insert(values: Record<string, unknown> | Record<string, unknown>[]): PromiseLike<{
      error: unknown;
    }> & {
      select(columns: string): {
        single(): PromiseLike<{ data: { id?: string } | null; error: unknown }>;
      };
    };
  };
}

export interface ReceiptContent {
  subject: string;
  html: string;
}

/**
 * Inserts the email_log row, then stores the rendered subject and html against its id.
 * Never throws: a lost log row or lost copy must not fail the send or the webhook.
 */
export async function logReceiptEmail(
  client: EmailLogInsertClient,
  row: Record<string, unknown>,
  content: ReceiptContent | null
): Promise<void> {
  try {
    const { data, error } = await client.from('email_log').insert(row).select('id').single();
    if (error) {
      console.error('Could not log Stripe confirmation email:', error);
      return;
    }
    if (content) await storeEmailContent(client, data?.id, content.subject, content.html);
  } catch (error) {
    console.error('Could not log Stripe confirmation email:', error);
  }
}
