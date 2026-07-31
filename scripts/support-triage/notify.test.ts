import { describe, expect, it, vi } from 'vitest';
import { renderClusterEmail, renderDraftEmail, sendEmail } from './notify';
import type { SupportTicket } from './types';

const TICKET: SupportTicket = {
  id: 'ticket-1',
  owner_id: 'owner-1',
  subject: 'Where is my armband?',
  status: 'open',
  is_show_day_priority: false,
  show_id: 'show-1',
  created_at: '2026-08-01T10:00:00.000Z',
};

const CONFIG = {
  apiKey: 'key',
  from: 'triage@example.com',
  to: 'operator@example.com',
  appUrl: 'https://app.example.com',
};

describe('renderDraftEmail', () => {
  it('includes the ticket subject, the draft, and a deep link', () => {
    const email = renderDraftEmail(TICKET, 'Open My Entries.', 'armband location', CONFIG.appUrl);
    expect(email.subject).toContain('Where is my armband?');
    expect(email.html).toContain('Open My Entries.');
    expect(email.html).toContain('https://app.example.com/admin/support?ticketId=ticket-1');
    expect(email.html).toContain('armband location');
  });

  it('says plainly that nothing was sent to the exhibitor', () => {
    const email = renderDraftEmail(TICKET, 'draft', 'label', CONFIG.appUrl);
    expect(email.html).toContain('Nothing was sent to the exhibitor');
  });

  it('escapes HTML in the ticket subject', () => {
    const email = renderDraftEmail(
      { ...TICKET, subject: '<script>alert(1)</script>' },
      'draft',
      'label',
      CONFIG.appUrl
    );
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('escapes HTML in the draft body', () => {
    const email = renderDraftEmail(TICKET, '<img src=x onerror=1>', 'label', CONFIG.appUrl);
    expect(email.html).not.toContain('<img');
  });

  it('escapes HTML in the cluster label', () => {
    const email = renderDraftEmail(TICKET, 'draft', '<b>bold</b>', CONFIG.appUrl);
    expect(email.html).not.toContain('<b>bold</b>');
  });

  it('tolerates a trailing slash on the app URL', () => {
    const email = renderDraftEmail(TICKET, 'draft', 'label', 'https://app.example.com/');
    expect(email.html).toContain('https://app.example.com/admin/support?ticketId=ticket-1');
    expect(email.html).not.toContain('.com//admin');
  });

  it('url-encodes the ticket id in the deep link', () => {
    const email = renderDraftEmail({ ...TICKET, id: 'a b&c' }, 'draft', 'label', CONFIG.appUrl);
    expect(email.html).toContain('ticketId=a%20b%26c');
  });
});

describe('renderClusterEmail', () => {
  it('names the show and every ticket', () => {
    const email = renderClusterEmail(
      { showId: 'show-1', ticketIds: ['a', 'b', 'c'], newestCreatedAt: '2026-08-01T12:00:00.000Z' },
      CONFIG.appUrl
    );
    expect(email.subject).toContain('3');
    expect(email.html).toContain('show-1');
    expect(email.html).toContain('/admin/support?ticketId=a');
    expect(email.html).toContain('/admin/support?ticketId=c');
  });

  it('frames the burst as a possible outage rather than separate questions', () => {
    const email = renderClusterEmail(
      { showId: 'show-1', ticketIds: ['a', 'b', 'c'], newestCreatedAt: '2026-08-01T12:00:00.000Z' },
      CONFIG.appUrl
    );
    expect(email.html).toContain('outage');
  });
});

describe('sendEmail', () => {
  it('posts to Resend with the API key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    await sendEmail(CONFIG, 'Subject', '<p>Body</p>', fetchImpl as unknown as typeof fetch);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer key');
    const body = JSON.parse(init.body as string);
    expect(body.subject).toBe('Subject');
    expect(body.to).toEqual(['operator@example.com']);
    expect(body.from).toBe('triage@example.com');
  });

  it('throws when Resend rejects the request', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 422, text: async () => 'bad from address' });
    await expect(
      sendEmail(CONFIG, 'Subject', '<p>Body</p>', fetchImpl as unknown as typeof fetch)
    ).rejects.toThrow('422');
  });

  it('does not put the API key in the thrown message', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' });
    await expect(
      sendEmail(CONFIG, 'Subject', '<p>Body</p>', fetchImpl as unknown as typeof fetch)
    ).rejects.not.toThrow(/key/);
  });
});
