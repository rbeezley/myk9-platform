// Pure recipient resolution for send-email message types whose recipient
// must be derived from the referenced resource, never from caller-supplied
// body fields (SA-018/SA-019 — see openspec/changes/security-audit-remediation).
//
// Deliberately does not accept the request body as input: a caller-supplied
// `to`/`cc` has no field in these input types, so it is structurally
// impossible for a third-party address to leak through this function.

export interface SupportNotificationRecipientSource {
  type: 'support_notification';
  ticket: { ownerEmail: string | null };
}

export interface EntryDecisionRecipientSource {
  type: 'entry_decision';
  registration: { exhibitorEmail: string | null };
}

/** Resolved-resource input for the message types with a derived recipient. */
export type DerivedRecipientSource =
  SupportNotificationRecipientSource | EntryDecisionRecipientSource;

export interface ResolvedEmailRecipient {
  to: string;
}

/**
 * Resolve the recipient for a `send-email` message type whose recipient is
 * a specific known party (the ticket owner, the registration exhibitor).
 *
 * Returns `null` when the resource's email cannot be resolved so the caller
 * can fail closed (no send) instead of falling back to a body-supplied
 * address.
 */
export function resolveDerivedRecipient(
  source: DerivedRecipientSource
): ResolvedEmailRecipient | null {
  const email =
    source.type === 'support_notification'
      ? source.ticket.ownerEmail
      : source.registration.exhibitorEmail;

  const trimmed = email?.trim();
  if (!trimmed) return null;

  return { to: trimmed };
}
