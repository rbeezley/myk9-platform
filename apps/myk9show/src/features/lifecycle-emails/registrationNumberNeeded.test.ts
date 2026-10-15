import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  LIFECYCLE_EMAIL_STEP_TYPES,
  buildLifecycleEmailPreview,
  buildRegistrationNumberNeededIdempotencyKey,
  readRegistrationNumberNeededHistory,
  fetchRegistrationNumberNeededJobCounts,
  type LifecycleEmailSupabaseClient,
} from './index';

const show = {
  name: 'Heartland Scent Work Trial',
  startDate: '2026-09-15',
  endDate: '2026-09-16',
  venueName: 'County Fairgrounds',
  location: 'Ames, IA',
};

describe('registration_number_needed draft', () => {
  const preview = buildLifecycleEmailPreview({
    stepType: 'registration_number_needed',
    show,
    recipient: { name: 'Jamie', email: 'jamie@example.com' },
    entry: { dogName: 'Willow', className: 'Container Novice A', registryName: 'UKC' },
  });

  it('names the dog, show and registry', () => {
    expect(preview.subject).toBe(
      'Registration number needed for Willow - Heartland Scent Work Trial'
    );
    expect(preview.bodyText).toContain('Hi Jamie,');
    expect(preview.bodyText).toContain(
      "Your entry for Willow at Heartland Scent Work Trial is held, but we need Willow's UKC registration number."
    );
    expect(preview.bodyText).toContain('Class: Container Novice A');
    expect(preview.bodyText).toContain('2026-09-15 to 2026-09-16 - County Fairgrounds, Ames, IA');
  });

  it('says how to supply the number', () => {
    expect(preview.bodyText).toContain('open Willow in myK9Show and add the number');
    expect(preview.bodyText).toContain('send the number to the show secretary');
  });

  it('falls back when the registry or dog is unknown, and warns without an address', () => {
    const bare = buildLifecycleEmailPreview({
      stepType: 'registration_number_needed',
      show,
      recipient: {},
      entry: null,
    });
    expect(bare.bodyText).toContain("we need your dog's registration number.");
    expect(bare.warnings).toContain('Recipient email is missing.');
  });

  it('escapes dog, show and secretary text in the html', () => {
    const hostile = buildLifecycleEmailPreview({
      stepType: 'registration_number_needed',
      show: { name: 'Show <b>one</b>' },
      recipient: { name: '<script>x</script>', email: 'a@example.com' },
      entry: { dogName: '<img src=x onerror=1>', registryName: 'AKC' },
      secretaryNote: '<i>note</i>',
    });
    expect(hostile.html).not.toContain('<script>');
    expect(hostile.html).not.toContain('<img src=x');
    expect(hostile.html).not.toContain('<i>note</i>');
    expect(hostile.html).toContain('&lt;img src=x onerror=1&gt;');
    expect(hostile.html).toContain('Show &lt;b&gt;one&lt;/b&gt;');
  });
});

describe('registration number needed idempotency', () => {
  const base = { showId: 'show-1', entryId: 'entry-1' };

  it('keeps the first email on the plain key and sequences every reminder', () => {
    const first = buildRegistrationNumberNeededIdempotencyKey({ ...base, priorCount: 0 });
    const reminder = buildRegistrationNumberNeededIdempotencyKey({ ...base, priorCount: 1 });
    const second = buildRegistrationNumberNeededIdempotencyKey({ ...base, priorCount: 2 });
    expect(first).toBe(
      'show-lifecycle-email:show-1:registration_number_needed:entry:single:entry-1:original'
    );
    expect(reminder).toBe(
      'show-lifecycle-email:show-1:registration_number_needed:entry:reminder-1:entry-1:original'
    );
    expect(new Set([first, reminder, second]).size).toBe(3);
  });

  it("reads the entry's earlier jobs: all of them count, ready and failed ones are outstanding", async () => {
    const calls: Array<[string, unknown]> = [];
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        calls.push([column, value]);
        return builder;
      }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data: [
            { id: 'a', status: 'sent' },
            { id: 'b', status: 'failed' },
            { id: 'c', status: 'ready' },
            { id: 'd', status: 'skipped' },
          ],
          error: null,
        }).then(resolve),
    };
    const supabase = { from: vi.fn(() => builder) } as unknown as LifecycleEmailSupabaseClient;

    await expect(
      readRegistrationNumberNeededHistory({ supabase, showId: 'show-1', entryId: 'entry-1' })
    ).resolves.toEqual({ count: 4, outstandingJobIds: ['b', 'c'] });
    expect(supabase.from).toHaveBeenCalledWith('show_lifecycle_email_jobs');
    expect(calls).toEqual([
      ['show_id', 'show-1'],
      ['step_type', 'registration_number_needed'],
      ['entry_id', 'entry-1'],
    ]);
  });
});

describe('step list parity with the database', () => {
  const dir = join(__dirname, '../../../../../supabase/migrations');
  const latest = readdirSync(dir)
    .filter(name => name.endsWith('myk9_1162_lifecycle_registration_number_needed.sql'))
    .sort()
    .at(-1);

  it('seeds and allows every client step type in the migration', () => {
    expect(latest).toBeDefined();
    const sql = readFileSync(join(dir, latest ?? ''), 'utf8');
    for (const stepType of LIFECYCLE_EMAIL_STEP_TYPES) {
      expect(sql.split(`'${stepType}'`).length - 1, stepType).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('fetchRegistrationNumberNeededJobCounts', () => {
  it('counts jobs per entry from one show-wide read, whatever the status', async () => {
    const filters: Array<[string, unknown]> = [];
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return builder;
      }),
      order: vi.fn(() => builder),
      gt: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      then: vi.fn(),
    };
    let page = 0;
    builder.then.mockImplementation((resolve: (value: unknown) => unknown) => {
      page += 1;
      const data =
        page === 1
          ? [
              { id: 'j1', entry_id: 'e1' },
              { id: 'j2', entry_id: 'e1' },
              { id: 'j3', entry_id: 'e2' },
              { id: 'j4', entry_id: null },
            ]
          : [];
      return Promise.resolve({ data, error: null }).then(resolve);
    });
    const supabase = { from: vi.fn(() => builder) } as unknown as LifecycleEmailSupabaseClient;

    await expect(
      fetchRegistrationNumberNeededJobCounts({ supabase, showId: 'show-1' })
    ).resolves.toEqual({ e1: 2, e2: 1 });
    expect(supabase.from).toHaveBeenCalledWith('show_lifecycle_email_jobs');
    expect(filters).toContainEqual(['show_id', 'show-1']);
    expect(filters).toContainEqual(['step_type', 'registration_number_needed']);
  });
});
