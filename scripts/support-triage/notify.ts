import type { TicketCluster } from './cluster';
import type { CarveOutReason, SupportTicket, TicketOwner } from './types';

export interface NotifyConfig {
  apiKey: string;
  from: string;
  to: string;
  appUrl: string;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// INTENT: The operator cannot tell who is asking from the inbox — it renders only the
// first 8 characters of the owner UUID (SupportInboxPage.tsx). Naming the exhibitor here
// is often what determines the right answer. See MYK9-139 for the inbox-side fix.
function ownerLine(owner: TicketOwner | null): string {
  if (!owner) return '<p><strong>From:</strong> unknown exhibitor</p>';
  const name = [owner.first_name, owner.last_name].filter(Boolean).join(' ').trim();
  const parts = [name || 'Name not on file', owner.email ?? 'no email on file'];
  return `<p><strong>From:</strong> ${escapeHtml(parts.join(' — '))}</p>`;
}

export function renderDraftEmail(
  ticket: SupportTicket,
  draft: string,
  clusterLabel: string,
  appUrl: string,
  owner: TicketOwner | null = null
): { subject: string; html: string } {
  const link = ticketLink(appUrl, ticket.id);
  return {
    subject: `[myK9 support draft] ${ticket.subject}`,
    html: [
      ownerLine(owner),
      `<p><strong>Topic:</strong> ${escapeHtml(clusterLabel)}</p>`,
      `<p><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>`,
      '<p><strong>Suggested reply:</strong></p>',
      `<blockquote style="white-space:pre-wrap">${escapeHtml(draft)}</blockquote>`,
      `<p><a href="${link}">Open this ticket in the support inbox</a></p>`,
      '<p style="color:#666">Nothing was sent to the exhibitor. Review and reply from the inbox.</p>',
    ].join('\n'),
  };
}

const CARVE_OUT_REASONS: Record<CarveOutReason, string> = {
  payment_or_refund: 'Payment or refund — needs your judgement, never auto-answered.',
  show_day_priority: 'Show-day priority — flagged urgent, never auto-answered.',
  repeat_question:
    'The exhibitor replied again after an earlier answer — auto-answering would read as being brushed off.',
};

// INTENT: Carved-out tickets are never sent to the model, so there is no draft to show.
// The operator gets the reason and a link instead.
export function renderCarveOutEmail(
  ticket: SupportTicket,
  reason: CarveOutReason,
  appUrl: string
,
  owner: TicketOwner | null = null
): { subject: string; html: string } {
  return {
    subject: `[myK9 support — needs you] ${ticket.subject}`,
    html: [
      ownerLine(owner),
      `<p><strong>Held for you:</strong> ${escapeHtml(CARVE_OUT_REASONS[reason])}</p>`,
      `<p><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>`,
      `<p><a href="${ticketLink(appUrl, ticket.id)}">Open this ticket in the support inbox</a></p>`,
      '<p style="color:#666">No draft was generated and nothing was sent to the exhibitor.</p>',
    ].join('\n'),
  };
}

export function renderCapReachedEmail(
  autoSent: number,
  appUrl: string
): { subject: string; html: string } {
  return {
    subject: '[myK9 support] auto-send cap reached — remaining tickets skipped',
    html: [
      `<p>The triage agent sent ${autoSent} automatic replies this pass and stopped at its cap.</p>`,
      '<p>Further matching tickets were skipped entirely — not sent, and not drafted. The cap resets on the next pass, so sending will resume in about 15 minutes unless you intervene.</p>',
      `<p><a href="${appUrl.replace(/\/$/, '')}/admin/support">Open the support inbox</a></p>`,
    ].join('\n'),
  };
}

export function renderClusterEmail(
  cluster: TicketCluster,
  appUrl: string
): { subject: string; html: string } {
  const count = cluster.ticketIds.length;
  return {
    subject: `[myK9 support] ${count} tickets from one show in the last hour`,
    html: [
      `<p>${count} open tickets reference show <code>${escapeHtml(String(cluster.showId))}</code> within the last hour. This may be an outage rather than ${count} separate questions.</p>`,
      '<ul>',
      ...cluster.ticketIds.map(
        id => `<li><a href="${ticketLink(appUrl, id)}">${escapeHtml(id)}</a></li>`
      ),
      '</ul>',
    ].join('\n'),
  };
}

export async function sendEmail(
  config: NotifyConfig,
  subject: string,
  html: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const response = await fetchImpl(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: config.from, to: [config.to], subject, html }),
  });
  if (!response.ok) {
    // Deliberately reports status and Resend's own text only — never the request
    // headers, so the API key cannot reach a log through this path.
    throw new Error(`Resend rejected the email (${response.status}): ${await response.text()}`);
  }
}

// The support inbox selects a ticket from the `ticketId` search param
// (apps/myk9show/src/pages/admin/SupportInboxPage.tsx). There is no
// /admin/support/:ticketId route — a path segment here would 404.
function ticketLink(appUrl: string, ticketId: string): string {
  return `${appUrl.replace(/\/$/, '')}/admin/support?ticketId=${encodeURIComponent(ticketId)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
