// MYK9-2115: the text of a show email, kept so the secretary can read what was sent.
//
// email_log stores no body. email_log_contents (service role only, no policies) holds the
// subject and html of SHOW-SCOPED emails (email_log.show_id set), read back through the
// get_show_email_content RPC, which checks the same permission as the delivery history.
// Never call this for auth emails (password reset links), club access requests or support.

/** html is cut at this many characters so one huge email cannot bloat the table. */
export const MAX_STORED_EMAIL_HTML_CHARS = 500_000;

const TRUNCATION_NOTE = '<p><em>This copy was shortened because the email was very large.</em></p>';

export interface EmailContentClient {
  from(table: string): {
    insert(
      values: Record<string, unknown> | Record<string, unknown>[]
    ): PromiseLike<{ error: unknown }>;
  };
}

export interface EmailContentItem {
  emailLogId: string | null | undefined;
  subject: string;
  html: string;
}

/**
 * Stores what emails said, next to their email_log rows. Never throws and never fails the
 * send: the mail has already left, and a lost copy is not worth reporting a delivered
 * email as a failure (the caller would release its claim and send it again).
 */
export async function storeEmailContents(
  client: EmailContentClient,
  items: readonly EmailContentItem[]
): Promise<void> {
  const rows = items
    .filter(item => item.emailLogId)
    .map(item => ({
      email_log_id: item.emailLogId,
      subject: item.subject,
      html:
        item.html.length > MAX_STORED_EMAIL_HTML_CHARS
          ? item.html.slice(0, MAX_STORED_EMAIL_HTML_CHARS) + TRUNCATION_NOTE
          : item.html,
    }));
  if (rows.length === 0) return;
  try {
    const { error } = await client.from('email_log_contents').insert(rows);
    if (error) {
      console.error('storeEmailContents: could not keep a copy of the email', {
        count: rows.length,
        error,
      });
    }
  } catch (error) {
    console.error('storeEmailContents: could not keep a copy of the email', {
      count: rows.length,
      error,
    });
  }
}

/** One email; see storeEmailContents. */
export function storeEmailContent(
  client: EmailContentClient,
  emailLogId: string | null | undefined,
  subject: string,
  html: string
): Promise<void> {
  return storeEmailContents(client, [{ emailLogId, subject, html }]);
}
