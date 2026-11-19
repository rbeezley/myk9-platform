import { describe, expect, it, vi } from 'vitest';
import { drainAutoEmailJobs } from './lifecycle-email-autoSend';
import {
  renderShowCancelledEmail,
  SHOW_CANCELLED_MONEY_LINE,
} from './lifecycle-email-showCancelled';
import { autoJob, makeAutoSendSupabase, publishedShow } from './lifecycle-email-autoSend.testUtils';

const cancelledShow = { ...publishedShow, status: 'cancelled' };
const WITH_ENTRY = { cancelledEntryPeople: ['person-1'] };

function cancelledTables(show: Record<string, unknown> = cancelledShow, jobStatus = 'ready') {
  return {
    shows: [show],
    show_lifecycle_email_jobs: [
      autoJob({ step_type: 'show_cancelled', status: jobStatus, idempotency_key: 'k-cancel' }),
    ],
  };
}

function drain(fixture: ReturnType<typeof makeAutoSendSupabase>) {
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'resend-1' }) }));
  const promise = drainAutoEmailJobs({
    deps: { fetch: fetch as unknown as typeof globalThis.fetch, resendApiKey: 'resend-key' },
    supabase: fixture.supabase,
    now: () => fixture.clock.at,
  });
  return { fetch, promise };
}

function sentBody(fetch: ReturnType<typeof vi.fn>) {
  const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(String(init.body)) as { to: string; subject: string; html: string };
}

describe('show cancelled email wording', () => {
  const email = renderShowCancelledEmail({
    showId: 'show-1',
    showName: 'Spring Scent Trial',
    recipientName: 'Jamie Handler',
  });

  it('says the show is cancelled and the club will contact them about entry fees', () => {
    expect(email.subject).toBe('Spring Scent Trial has been cancelled');
    expect(email.body).toContain('Hi Jamie,');
    expect(email.body).toContain('Spring Scent Trial has been cancelled.');
    expect(email.body).toContain('The club will contact you about your entry fees.');
    expect(SHOW_CANCELLED_MONEY_LINE).toBe('The club will contact you about your entry fees.');
  });

  it('promises no refund and names no amount, date or dash', () => {
    expect(email.body).not.toMatch(/refund|reimburs|money back|\$|\d+ (days|hours)|—/i);
    const withoutLink = email.body.replace(/https:\/\/\S+/g, '');
    expect(withoutLink).not.toMatch(/\d/);
  });
});

describe('show cancelled email drain', () => {
  it('sends the email to a person with an entry while the show is cancelled', async () => {
    const fixture = makeAutoSendSupabase(cancelledTables(), WITH_ENTRY);
    const { fetch, promise } = drain(fixture);
    await expect(promise).resolves.toMatchObject({ claimed: 1, sent: 1, skipped: 0 });
    const sent = sentBody(fetch);
    expect(sent.to).toBe('jamie@example.com');
    expect(sent.subject).toBe('Spring Scent Trial has been cancelled');
    expect(sent.html).toContain('The club will contact you about your entry fees.');
    expect(fixture.tables.show_lifecycle_email_jobs[0]).toMatchObject({ status: 'sent' });
    // Delivery history lists it: one log row with the show and the job.
    expect(fixture.tables.email_log).toEqual([
      expect.objectContaining({ status: 'sent', show_id: 'show-1', related_id: 'job-1' }),
    ]);
  });

  it('releases a held job before it claims, so only this sender ever sends it', async () => {
    const fixture = makeAutoSendSupabase(cancelledTables(cancelledShow, 'held'), WITH_ENTRY);
    const { promise } = drain(fixture);
    await expect(promise).resolves.toMatchObject({ claimed: 1, sent: 1 });
  });

  it('skips the person whose entries were all pulled or withdrawn', async () => {
    const fixture = makeAutoSendSupabase(cancelledTables(), { cancelledEntryPeople: [] });
    const { fetch, promise } = drain(fixture);
    await expect(promise).resolves.toMatchObject({ claimed: 1, sent: 0, skipped: 1 });
    expect(fetch).not.toHaveBeenCalled();
    expect(fixture.tables.show_lifecycle_email_jobs[0]).toMatchObject({ status: 'skipped' });
  });

  it('skips when the show was reopened before the email went out', async () => {
    const fixture = makeAutoSendSupabase(cancelledTables(publishedShow), WITH_ENTRY);
    const { fetch, promise } = drain(fixture);
    await expect(promise).resolves.toMatchObject({ sent: 0, skipped: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('skips a show that was deleted', async () => {
    const fixture = makeAutoSendSupabase(
      cancelledTables({ ...cancelledShow, deleted_at: '2026-11-19T00:00:00Z' }),
      WITH_ENTRY
    );
    const { fetch, promise } = drain(fixture);
    await expect(promise).resolves.toMatchObject({ sent: 0, skipped: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('is not held back by the step switch: the secretary cannot stop it', async () => {
    const fixture = makeAutoSendSupabase(
      {
        ...cancelledTables(),
        show_lifecycle_email_steps: [
          { show_id: 'show-1', step_type: 'show_cancelled', is_enabled: false },
        ],
      },
      WITH_ENTRY
    );
    const { promise } = drain(fixture);
    await expect(promise).resolves.toMatchObject({ sent: 1, skipped: 0 });
  });

  it('a sent job is never claimed again, so a second drain sends nothing', async () => {
    const fixture = makeAutoSendSupabase(cancelledTables(), WITH_ENTRY);
    await drain(fixture).promise;
    const second = drain(fixture);
    await expect(second.promise).resolves.toMatchObject({ claimed: 0, sent: 0 });
    expect(second.fetch).not.toHaveBeenCalled();
  });
});
