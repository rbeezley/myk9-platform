import { describe, expect, it, vi } from 'vitest';
import { drainAutoEmailJobs } from './lifecycle-email-autoSend';
import { renderHtmlEmail } from './lifecycle-email-shared';
import {
  judgeChangeRefundLine,
  renderJudgeChangedEmail,
  type JudgeChange,
} from './lifecycle-email-judgeChanged';
import {
  judgeChangedJob,
  judgeChangedTables,
  makeAutoSendSupabase,
} from './lifecycle-email-autoSend.testUtils';

const LIVE = { liveEntryPeople: ['person-1'], liveEntryClasses: { 'person-1': ['class-1'] } };

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

const change: JudgeChange = {
  className: 'Container Novice A',
  where: 'Saturday Trial, Saturday, November 21, 2026',
  fromJudge: 'Olly Oldjudge',
  toJudge: 'Bea Newjudge',
};

describe('judge changed email wording', () => {
  it('AKC names old and new judge and says how to withdraw for a full refund', () => {
    const email = renderJudgeChangedEmail({
      showId: 'show-1',
      showName: 'Spring Scent Trial',
      recipientName: 'Jamie Handler',
      registryId: 'AKC',
      changes: [change],
    });
    expect(email.subject).toBe('Judge change for Spring Scent Trial');
    expect(email.body).toContain(
      'Container Novice A (Saturday Trial, Saturday, November 21, 2026): was Judge Olly Oldjudge, now Judge Bea Newjudge'
    );
    expect(email.body).toContain(
      'Under AKC rules, when a judge changes after the premium list went out, you may withdraw from the affected class (Container Novice A (Saturday Trial, Saturday, November 21, 2026)) and ask for a full refund of its entry fee. Tell the trial secretary in writing. If the change was made before the judging schedule was sent out, your request must reach the trial secretary at least 30 minutes before the event starts on your first day entered. If it was made after, your request must reach the trial secretary before judging of that class starts.'
    );
    expect(email.body).toContain('Hi Jamie,');
  });

  it('AKC states both deadlines, and never a withdrawal or automatic promise', () => {
    const line = judgeChangeRefundLine('AKC', [change]);
    expect(line).toContain('30 minutes before the event starts on your first day entered');
    expect(line).toContain('after the premium list went out');
    expect(line).toContain('you may withdraw from');
    expect(line).toContain('Tell the trial secretary in writing.');
    expect(line).toContain('before judging of that class starts');
    expect(line).not.toMatch(/automatic|pull|\u2014/i);
  });

  it('UKC says the exhibitor may ask the trial secretary in writing for a full refund', () => {
    expect(judgeChangeRefundLine('UKC', [change])).toBe(
      'Under UKC rules, you may ask the trial secretary in writing for a full refund.'
    );
  });

  it('ASCA makes no refund promise', () => {
    const line = judgeChangeRefundLine('ASCA', [change]);
    expect(line).toBe('Contact the trial secretary with questions.');
    expect(line).not.toMatch(/refund|withdraw/i);
  });

  it('a blank or unknown registry reads as AKC, as getTrialRegistry does', () => {
    expect(judgeChangeRefundLine(null, [change])).toContain(
      'Under AKC rules, when a judge changes'
    );
    expect(judgeChangeRefundLine('', [change])).toContain('Under AKC rules, when a judge changes');
  });

  it('never says a refund is automatic, never says pull, has no em dash', () => {
    for (const registryId of ['AKC', 'UKC', 'ASCA']) {
      const { body } = renderJudgeChangedEmail({
        showId: 'show-1',
        showName: 'Spring Scent Trial',
        recipientName: null,
        registryId,
        changes: [change, { ...change, className: 'Interior Novice A', fromJudge: null }],
      });
      expect(body).not.toMatch(/automatic|\bpull|—/i);
      expect(body).toContain('now Judge Bea Newjudge');
    }
  });

  it('lists several classes in one email and falls back when the old judge has no name', () => {
    const { body } = renderJudgeChangedEmail({
      showId: 'show-1',
      showName: 'Spring Scent Trial',
      recipientName: null,
      registryId: 'AKC',
      changes: [change, { ...change, className: 'Interior Novice A', fromJudge: null }],
    });
    expect(body).toContain(
      'The judge for 2 classes you are entered in at Spring Scent Trial has changed.'
    );
    expect(body).toContain(
      'Interior Novice A (Saturday Trial, Saturday, November 21, 2026): was the previous judge'
    );
    expect(body).toContain(
      'Under AKC rules, when a judge changes after the premium list went out, you may withdraw from each affected class (Container Novice A (Saturday Trial, Saturday, November 21, 2026); Interior Novice A (Saturday Trial, Saturday, November 21, 2026)) and ask for a full refund of its entry fee. Tell the trial secretary in writing. If the change was made before the judging schedule was sent out, your request must reach the trial secretary at least 30 minutes before the event starts on your first day entered. If it was made after, your request must reach the trial secretary before judging of that class starts.'
    );
    expect(body).toContain('Hi there,');
  });
});

describe('drainAutoEmailJobs for judge_changed', () => {
  it('sends the registry wording, records it for Delivery history, and marks the job sent', async () => {
    const fixture = makeAutoSendSupabase(judgeChangedTables('UKC'), LIVE);
    const { fetch, promise } = drain(fixture);

    await expect(promise).resolves.toMatchObject({ claimed: 1, sent: 1, skipped: 0 });

    const sent = sentBody(fetch);
    expect(sent.to).toBe('jamie@example.com');
    expect(sent.subject).toBe('Judge change for Spring Scent Trial');
    expect(sent.html).toContain('was Judge Olly Oldjudge, now Judge Bea Newjudge');
    expect(sent.html).toContain(
      'Under UKC rules, you may ask the trial secretary in writing for a full refund.'
    );
    expect(fixture.tables.email_log).toEqual([
      expect.objectContaining({
        email_type: 'show_lifecycle_email',
        related_id: 'job-1',
        show_id: 'show-1',
        status: 'sent',
      }),
    ]);
    expect(fixture.tables.show_lifecycle_email_jobs[0]).toMatchObject({ status: 'sent' });
  });

  it('puts every changed class the exhibitor is in into one email, and only those', async () => {
    const tables = judgeChangedTables('AKC');
    tables.show_lifecycle_email_jobs = [
      judgeChangedJob({
        judge_changes: { 'class-1': 'judge-old', 'class-2': 'judge-old', 'class-3': 'judge-old' },
      }),
    ];
    const trial = {
      name: 'Sunday Trial',
      date: '2026-11-22',
      registry_id: 'AKC',
      deleted_at: null,
    };
    tables.classes.push(
      { id: 'class-2', name: 'Interior Novice A', deleted_at: null, trials: trial },
      { id: 'class-3', name: 'Buried Novice A', deleted_at: null, trials: trial }
    );
    tables.judge_assignments.push(
      {
        class_id: 'class-2',
        status: 'confirmed',
        person_id: 'judge-new',
        person: { first_name: 'Bea', last_name: 'Newjudge', deleted_at: null },
      },
      {
        class_id: 'class-3',
        status: 'confirmed',
        person_id: 'judge-new',
        person: { first_name: 'Bea', last_name: 'Newjudge', deleted_at: null },
      }
    );
    // The exhibitor is entered in classes 1 and 2 only.
    const fixture = makeAutoSendSupabase(tables, {
      liveEntryPeople: ['person-1'],
      liveEntryClasses: { 'person-1': ['class-1', 'class-2'] },
    });
    const { fetch, promise } = drain(fixture);

    await promise;

    const html = sentBody(fetch).html;
    expect(html).toContain('Container Novice A');
    expect(html).toContain('Interior Novice A');
    expect(html).not.toContain('Buried Novice A');
    expect(html).toContain('2 classes');
  });

  async function skipped(
    mutate: (tables: Record<string, Array<Record<string, unknown>>>) => void,
    options = LIVE
  ) {
    const tables = judgeChangedTables();
    mutate(tables);
    const fixture = makeAutoSendSupabase(tables, options);
    const { fetch, promise } = drain(fixture);
    const result = await promise;
    return { fixture, fetch, result };
  }

  it('skips when the show is no longer published', async () => {
    const { fixture, fetch, result } = await skipped(tables => {
      tables.shows = [{ ...tables.shows[0], status: 'draft' }];
    });
    expect(result.skipped).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(fixture.tables.show_lifecycle_email_jobs[0]).toMatchObject({ status: 'skipped' });
  });

  it('skips when the secretary switched the step off', async () => {
    const { fetch, result } = await skipped(tables => {
      tables.show_lifecycle_email_steps = [
        { show_id: 'show-1', step_type: 'judge_changed', is_enabled: false },
      ];
    });
    expect(result.skipped).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('skips when the person no longer has a live entry in an affected class', async () => {
    const { fetch, result } = await skipped(() => undefined, {
      liveEntryPeople: ['person-1'],
      liveEntryClasses: { 'person-1': ['some-other-class'] },
    });
    expect(result.skipped).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('skips when the judge was changed back, so nothing is different', async () => {
    const { fetch, result } = await skipped(tables => {
      tables.judge_assignments[0].person_id = 'judge-old';
    });
    expect(result.skipped).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('judge changed email: vacancy, wording, link', () => {
  it('still sends when the class has no judge yet, saying a new one has not been named', async () => {
    const tables = judgeChangedTables('AKC');
    tables.judge_assignments = [];
    const fixture = makeAutoSendSupabase(tables, LIVE);
    const { fetch, promise } = drain(fixture);

    await expect(promise).resolves.toMatchObject({ sent: 1, skipped: 0 });
    const html = sentBody(fetch).html;
    expect(html).toContain('was Judge Olly Oldjudge');
    expect(html).not.toContain('now Judge');
    expect(html).toContain(
      'A new judge for Container Novice A (Saturday Trial, Saturday, November 21, 2026) has not been named yet. The trial secretary will tell you who it is.'
    );
    expect(html).not.toMatch(/\u2014/);
    expect(fixture.tables.show_lifecycle_email_jobs).toHaveLength(1);
    expect(fixture.tables.show_lifecycle_email_jobs[0]).toMatchObject({ status: 'sent' });
  });

  it('skips a judge-less class once the trial day has passed in the show time zone', async () => {
    const tables = judgeChangedTables();
    tables.judge_assignments = [];
    (tables.classes[0].trials as { date: string }).date = '2026-11-10';
    const fixture = makeAutoSendSupabase(tables, LIVE);
    const { fetch, promise } = drain(fixture);

    await expect(promise).resolves.toMatchObject({ skipped: 1, sent: 0 });
    expect(fetch).not.toHaveBeenCalled();
    expect(fixture.tables.show_lifecycle_email_jobs[0]).toMatchObject({ status: 'skipped' });
  });

  it('names a judged class and a judge-less class together in one email', async () => {
    const tables = judgeChangedTables('AKC');
    tables.show_lifecycle_email_jobs = [
      judgeChangedJob({ judge_changes: { 'class-1': 'judge-old', 'class-2': 'judge-old' } }),
    ];
    tables.classes.push({
      id: 'class-2',
      name: 'Interior Novice A',
      deleted_at: null,
      trials: {
        name: 'Sunday Trial',
        date: '2026-11-22',
        registry_id: 'AKC',
        timezone: null,
        deleted_at: null,
      },
    });
    const fixture = makeAutoSendSupabase(tables, {
      liveEntryPeople: ['person-1'],
      liveEntryClasses: { 'person-1': ['class-1', 'class-2'] },
    });
    const { fetch, promise } = drain(fixture);
    await promise;
    const html = sentBody(fetch).html;
    expect(html).toContain('now Judge Bea Newjudge');
    expect(html).toContain(
      'A new judge for Interior Novice A (Sunday Trial, Sunday, November 22, 2026) has not been named yet.'
    );
    expect(fixture.tables.email_log).toHaveLength(1);
  });

  it('states the AKC rule per class with trial labels, and never promises an automatic refund', () => {
    const { body } = renderJudgeChangedEmail({
      showId: 'show-1',
      showName: 'Spring Scent Trial',
      recipientName: null,
      registryId: 'AKC',
      changes: [
        change,
        {
          ...change,
          className: 'Interior Novice A',
          where: 'Sunday Trial, Sunday, November 22, 2026',
        },
      ],
    });
    expect(body).toContain(
      'each affected class (Container Novice A (Saturday Trial, Saturday, November 21, 2026); Interior Novice A (Sunday Trial, Sunday, November 22, 2026))'
    );
    expect(body).not.toMatch(/automatic|already started/i);
  });

  it('UKC states no class cutoff', () => {
    expect(judgeChangeRefundLine('UKC', [change])).not.toMatch(/before|starts/);
  });

  it("sends to the recipient's current address, not the one on the job", async () => {
    const tables = judgeChangedTables();
    tables.people.push({ id: 'person-1', email: 'jamie.new@example.com', deleted_at: null });
    const fixture = makeAutoSendSupabase(tables, LIVE);
    const { fetch, promise } = drain(fixture);
    await promise;
    expect(sentBody(fetch).to).toBe('jamie.new@example.com');
    expect(fixture.tables.email_log[0]).toMatchObject({ recipient_email: 'jamie.new@example.com' });
  });

  it('skips when the recipient has no email now', async () => {
    const tables = judgeChangedTables();
    tables.people.push({ id: 'person-1', email: '  ', deleted_at: null });
    const fixture = makeAutoSendSupabase(tables, LIVE);
    const { fetch, promise } = drain(fixture);
    await expect(promise).resolves.toMatchObject({ skipped: 1, sent: 0 });
    expect(fetch).not.toHaveBeenCalled();
    expect(fixture.tables.show_lifecycle_email_jobs[0]).toMatchObject({ status: 'skipped' });
  });

  it('leaves sentence punctuation out of a linked URL', () => {
    const html = renderHtmlEmail(
      'S',
      'See (https://myk9show.com/x).\n\nOr https://myk9show.com/y?a=1, then https://myk9show.com/z!',
      ''
    );
    expect(html).toContain(
      '(<a href="https://myk9show.com/x" style="color:#1d4ed8;">https://myk9show.com/x</a>).'
    );
    expect(html).toContain(
      '<a href="https://myk9show.com/y?a=1" style="color:#1d4ed8;">https://myk9show.com/y?a=1</a>,'
    );
    expect(html).toContain('>https://myk9show.com/z</a>!');
  });

  it('the My Shows link is an anchor in the HTML and a plain URL in the stored text', async () => {
    const fixture = makeAutoSendSupabase(judgeChangedTables(), LIVE);
    const { fetch, promise } = drain(fixture);
    await promise;
    const url = 'https://myk9show.com/exhibitor/entries?showId=show-1';
    expect(sentBody(fetch).html).toContain(`<a href="${url.replace('&', '&amp;')}"`);
    expect(fixture.tables.email_log[0]).not.toHaveProperty('body_html');
    const { body } = renderJudgeChangedEmail({
      showId: 'show-1',
      showName: 'S',
      recipientName: null,
      registryId: 'AKC',
      changes: [change],
    });
    expect(body).toContain(url);
    expect(body).not.toContain('<a ');
  });
});
