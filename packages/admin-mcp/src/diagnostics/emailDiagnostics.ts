/**
 * `diagnose_confirmation_email` — why an entry's confirmation email is or isn't sent.
 *
 * Cross-checks the entry's own confirmation columns against `email_log`, joined
 * by `related_id = entry id` and (when present) by
 * `resend_message_id = entries.confirmation_email_message_id`. "Marked sent on
 * the entry but no email-log row" is surfaced as a limitation, never hidden —
 * and an email-log read failure returns `source_unavailable` rather than
 * claiming the email failed.
 */
import type { AdminToolDefinition } from '../mcp/server';
import type { ToolContext } from '../tools/index';
import {
  diagnoseConfirmationEmailInput,
  type DiagnoseConfirmationEmailInput,
} from '../tools/schemas';
import { buildEntryManagementLink } from './links';
import { redactEmail, shortenProviderId } from './redaction';
import type { DiagnosticEvidence, DiagnosticResult } from './types';
import { createDiagnosticResult } from './types';

interface EmailLogRow {
  status: string;
  error_message: string | null;
  created_at: string;
  status_updated_at: string | null;
  resend_message_id: string | null;
  recipient_email: string;
}

export async function diagnoseConfirmationEmail(
  input: DiagnoseConfirmationEmailInput,
  ctx: ToolContext,
): Promise<DiagnosticResult> {
  const { config, supabase } = ctx;
  const { entryId } = input;

  const entry = await supabase
    .from('entries')
    .select(
      'id, show_id, confirmation_email_sent_at, confirmation_email_message_id, confirmation_email_status',
    )
    .eq('id', entryId)
    .maybeSingle();
  if (entry.error) {
    return createDiagnosticResult(config.envLabel, 'source_unavailable', {
      limitations: ['Could not read the entry record.'],
    });
  }
  if (!entry.data) {
    return createDiagnosticResult(config.envLabel, 'not_found', {
      summary: { entryId },
      limitations: [`No entry found for id ${entryId}.`],
    });
  }
  const e = entry.data;
  const messageId = e.confirmation_email_message_id;

  const baseLogQuery = supabase
    .from('email_log')
    .select(
      'status, error_message, created_at, status_updated_at, resend_message_id, recipient_email',
    );
  const log = await (messageId
    ? baseLogQuery.or(`related_id.eq.${entryId},resend_message_id.eq.${messageId}`)
    : baseLogQuery.eq('related_id', entryId)
  ).returns<EmailLogRow[]>();
  if (log.error) {
    return createDiagnosticResult(config.envLabel, 'source_unavailable', {
      limitations: ['Could not read the email log.'],
    });
  }
  const logRows = log.data ?? [];
  const primaryLog = logRows[0] ?? null;

  // A pending status with no timestamp and no message id means nothing was sent.
  const hasSendRecord =
    Boolean(e.confirmation_email_sent_at) ||
    Boolean(messageId) ||
    e.confirmation_email_status !== 'pending';

  const evidence: DiagnosticEvidence[] = [
    {
      label: 'Entry confirmation status',
      value: e.confirmation_email_status,
      source: 'entries.confirmation_email_status',
    },
    {
      label: 'Sent at',
      value: e.confirmation_email_sent_at,
      source: 'entries.confirmation_email_sent_at',
    },
    {
      label: 'Provider message id',
      value: shortenProviderId(messageId),
      source: 'entries.confirmation_email_message_id',
    },
  ];
  for (const row of logRows) {
    evidence.push({
      label: 'Email-log status',
      value: row.status,
      source: 'email_log.status',
    });
    if (row.error_message) {
      evidence.push({
        label: 'Email-log error',
        value: row.error_message,
        source: 'email_log.error_message',
      });
    }
    evidence.push({
      label: 'Email-log recipient',
      value: redactEmail(row.recipient_email),
      source: 'email_log.recipient_email',
    });
  }

  const limitations: string[] = [];
  if (logRows.length === 0) {
    limitations.push(
      'No email-log row was found for this entry id or confirmation message id.',
    );
  }

  const links = e.show_id
    ? [buildEntryManagementLink(config, e.show_id, entryId)]
    : [];

  if (!hasSendRecord && logRows.length === 0) {
    return createDiagnosticResult(config.envLabel, 'insufficient_data', {
      summary: {
        entryId,
        emailStatus: e.confirmation_email_status,
        sent: false,
        assessment: 'No confirmation email has been sent for this entry yet.',
      },
      evidence,
      links,
      limitations,
    });
  }

  let assessment: string;
  if (e.confirmation_email_status === 'sent' && logRows.length === 0) {
    assessment =
      'Marked sent on the entry, but no matching email-log row was found.';
  } else if (
    e.confirmation_email_status === 'failed' ||
    e.confirmation_email_status === 'bounced'
  ) {
    assessment = `Confirmation email ${e.confirmation_email_status}${
      primaryLog?.error_message ? `: ${primaryLog.error_message}` : ''
    }.`;
  } else {
    assessment = `Confirmation email status: ${e.confirmation_email_status}${
      primaryLog ? ` (email-log: ${primaryLog.status})` : ''
    }.`;
  }

  return createDiagnosticResult(config.envLabel, 'found', {
    summary: {
      entryId,
      emailStatus: e.confirmation_email_status,
      sentAt: e.confirmation_email_sent_at,
      emailLogStatus: primaryLog?.status ?? null,
      assessment,
    },
    evidence,
    links,
    limitations,
  });
}

export function diagnoseConfirmationEmailTool(
  ctx: ToolContext,
): AdminToolDefinition {
  return {
    name: 'diagnose_confirmation_email',
    description:
      'Diagnose why an entry did or did not get a confirmation email, ' +
      'cross-checking the entry record against the email log. Read-only.',
    inputSchema: {
      type: 'object',
      properties: { entryId: { type: 'string', description: 'Entry UUID' } },
      required: ['entryId'],
      additionalProperties: false,
    },
    parseInput: (raw) => diagnoseConfirmationEmailInput.parse(raw),
    handle: (input) =>
      diagnoseConfirmationEmail(input as DiagnoseConfirmationEmailInput, ctx),
  };
}
