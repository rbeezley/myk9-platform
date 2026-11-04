import type { MessageShowRecipientType } from './messageShow';

// What send-targeted-message reports about the "also send by email" option.
export interface MessageShowEmailResult {
  recipients: number;
  sent: number;
  failed: number;
  /** People in the audience with no usable email address on file, by name. */
  missing: string[];
  /** The email went out but could not be recorded in Email delivery history. */
  logFailed: boolean;
}

export function parseMessageShowEmailResult(data: unknown): MessageShowEmailResult | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  if (typeof row.email_recipients !== 'number') return null;
  return {
    recipients: row.email_recipients,
    sent: Number(row.email_sent ?? 0),
    failed: Number(row.email_failed ?? 0),
    missing: Array.isArray(row.email_missing)
      ? row.email_missing.filter((name): name is string => typeof name === 'string')
      : [],
    logFailed: row.email_log_failed === true,
  };
}

export function describeEmailAudience(
  recipient: MessageShowRecipientType,
  classLabel?: string | null
): string {
  if (recipient === 'checked_in') return 'everyone checked in';
  if (recipient === 'class') return `exhibitors in ${classLabel?.trim() || 'this class'}`;
  return 'everyone in the show';
}

function peopleLabel(count: number): string {
  return `${count} ${count === 1 ? 'person' : 'people'}`;
}

function missingSentence(missing: string[]): string {
  return `No usable email address on file for ${peopleLabel(missing.length)}: ${missing.join(', ')}.`;
}

/** Plain-words promise shown before Send: who gets the email, and who cannot. */
export function buildEmailAudienceCopy(audience: string, preview: MessageShowEmailResult): string {
  if (preview.recipients === 0) {
    return `No one in ${audience} has a usable email address on file, so no email will be sent. ${missingSentence(preview.missing)}`.trim();
  }
  const base = `Will also email ${peopleLabel(preview.recipients)} in ${audience}.`;
  return preview.missing.length ? `${base} ${missingSentence(preview.missing)}` : base;
}

/** Outcome shown after Send, naming anyone who was skipped or whose email failed. */
export function buildEmailResultCopy(result: MessageShowEmailResult): string {
  const parts = [`Emailed ${peopleLabel(result.sent)}.`];
  if (result.failed > 0) parts.push(`${peopleLabel(result.failed)} could not be emailed.`);
  if (result.missing.length) parts.push(missingSentence(result.missing));
  return parts.join(' ');
}
