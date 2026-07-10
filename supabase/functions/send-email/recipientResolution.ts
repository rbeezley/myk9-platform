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
  registration: {
    exhibitorEmail: string | null;
    // The referenced registration's show, resolved server-side. Drives the
    // secretary-cc feature (`cc_secretary_on_exhibitor_emails`) so it is not
    // silently dropped when the (untrusted) body-supplied cc is ignored.
    show: {
      ccSecretaryOnExhibitorEmails: boolean | null;
      secretaryEmail: string | null;
    };
  };
}

/** Resolved-resource input for the message types with a derived recipient. */
export type DerivedRecipientSource =
  SupportNotificationRecipientSource | EntryDecisionRecipientSource;

export interface ResolvedEmailRecipient {
  to: string;
  cc?: string[];
}

/**
 * Server-side secretary cc, mirroring `send-registration-email`'s
 * `resolveSecretaryCc`: cc the show's secretary on exhibitor emails when the
 * per-show toggle is enabled (default enabled) and a secretary email exists.
 */
function resolveSecretaryCc(
  ccToggle: boolean | null | undefined,
  secretaryEmail: string | null | undefined
): string[] {
  const enabled = ccToggle ?? true;
  if (!enabled) return [];
  const trimmed = secretaryEmail?.trim();
  return trimmed ? [trimmed] : [];
}

/**
 * Resolve the recipient (and any server-derived cc) for a `send-email` message
 * type whose recipient is a specific known party (the ticket owner, the
 * registration exhibitor).
 *
 * Returns `null` when the resource's recipient email cannot be resolved so the
 * caller can fail closed (no send) instead of falling back to a body-supplied
 * address.
 */
export function resolveDerivedRecipient(
  source: DerivedRecipientSource
): ResolvedEmailRecipient | null {
  if (source.type === 'support_notification') {
    const trimmed = source.ticket.ownerEmail?.trim();
    return trimmed ? { to: trimmed } : null;
  }

  const trimmed = source.registration.exhibitorEmail?.trim();
  if (!trimmed) return null;

  const cc = resolveSecretaryCc(
    source.registration.show.ccSecretaryOnExhibitorEmails,
    source.registration.show.secretaryEmail
  );

  return cc.length ? { to: trimmed, cc } : { to: trimmed };
}
