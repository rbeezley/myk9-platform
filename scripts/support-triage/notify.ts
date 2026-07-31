import type { TicketCluster } from './cluster';
import type { SupportTicket } from './types';

export interface NotifyConfig {
  apiKey: string;
  from: string;
  to: string;
  appUrl: string;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function renderDraftEmail(
  ticket: SupportTicket,
  draft: string,
  clusterLabel: string,
  appUrl: string
): { subject: string; html: string } {
  const link = ticketLink(appUrl, ticket.id);
  return {
    subject: `[myK9 support draft] ${ticket.subject}`,
    html: [
      `<p><strong>Topic:</strong> ${escapeHtml(clusterLabel)}</p>`,
      `<p><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>`,
      '<p><strong>Suggested reply:</strong></p>',
      `<blockquote style="white-space:pre-wrap">${escapeHtml(draft)}</blockquote>`,
      `<p><a href="${link}">Open this ticket in the support inbox</a></p>`,
      '<p style="color:#666">Nothing was sent to the exhibitor. Review and reply from the inbox.</p>',
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
