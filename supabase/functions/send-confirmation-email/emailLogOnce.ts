// Records one email_log row per provider message (MYK9-2088). A send recovered under the same
// idempotency key gets the same Resend message id back; if the first attempt's log row was
// written (only the sent stamp failed), the recovery must not add a second row, which would show
// the secretary two sends and break the webhook's one-row lookup by message id. email_log has no
// unique index on resend_message_id (061 made a plain one, and other senders write it), so this
// is select-then-insert; the claim lease keeps two runs from racing here. An existing row keeps
// its delivery status (the webhook may have advanced it). Deno-free so vitest can import it.

/** The slice of the Supabase client this touches. */
// deno-lint-ignore no-explicit-any
type Client = { from(table: string): any };

/** Inserts the row unless its provider message id is already logged; returns the row id or null. */
export async function insertEmailLogOnce(
  supabase: Client,
  row: Record<string, unknown> & { resend_message_id: string | null },
  nowIso: string
): Promise<{ id: string | null; existing: boolean; error: unknown }> {
  if (row.resend_message_id) {
    const { data, error } = await supabase
      .from('email_log')
      .select('id')
      .eq('resend_message_id', row.resend_message_id)
      .limit(1);
    if (error) return { id: null, existing: false, error };
    const found = (data as Array<{ id: string }> | null)?.[0];
    if (found) return { id: found.id, existing: true, error: null };
  }
  const { data, error } = await supabase
    .from('email_log')
    .insert({ ...row, status_updated_at: nowIso })
    .select('id')
    .single();
  return { id: (data as { id: string } | null)?.id ?? null, existing: false, error };
}
