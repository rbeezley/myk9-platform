// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  claimSubmissionEntries,
  parseEntryIds,
  releaseSubmissionClaim,
  submissionIdempotencyKey,
  summarizeSubmission,
  type EntryClaimClient,
} from './submissionReceipt';

interface Row {
  id: string;
  confirmation_email_sent_at: string | null;
  confirmation_email_status: string;
}

/** An in-memory entries table whose conditional update behaves like the database's. */
function fakeEntries(rows: Row[]): EntryClaimClient {
  return {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        const apply = (ids: string[], onlyUnsent: boolean) =>
          rows
            .filter(
              r => ids.includes(r.id) && (!onlyUnsent || r.confirmation_email_sent_at === null)
            )
            .map(r => Object.assign(r, patch) && { id: r.id });
        return {
          in: (_column: string, ids: string[]) =>
            Object.assign(
              Promise.resolve({ error: null }).then(() => (apply(ids, false), { error: null })),
              {
                is: () => ({
                  select: () => Promise.resolve({ data: apply(ids, true), error: null }),
                }),
              }
            ),
        };
      },
    }),
  } as unknown as EntryClaimClient;
}

const unsent = (id: string): Row => ({
  id,
  confirmation_email_sent_at: null,
  confirmation_email_status: 'pending',
});

describe('claimSubmissionEntries (once per submission)', () => {
  it('the first call claims every entry and a retry claims nothing, so nothing is sent twice', async () => {
    const rows = [unsent('e1'), unsent('e2')];
    const client = fakeEntries(rows);

    expect(await claimSubmissionEntries(client, ['e1', 'e2'], '2026-11-14T10:00:00Z')).toEqual([
      'e1',
      'e2',
    ]);
    expect(await claimSubmissionEntries(client, ['e1', 'e2'], '2026-11-14T10:01:00Z')).toEqual([]);
  });

  it('a double submit that adds one dog claims only the new entry', async () => {
    const client = fakeEntries([unsent('e1'), unsent('e2')]);
    await claimSubmissionEntries(client, ['e1'], '2026-11-14T10:00:00Z');
    expect(await claimSubmissionEntries(client, ['e1', 'e2'], '2026-11-14T10:01:00Z')).toEqual([
      'e2',
    ]);
  });

  it('stamps the markers the scheduled sender filters on, so it skips a claimed entry', async () => {
    const rows = [unsent('e1')];
    await claimSubmissionEntries(fakeEntries(rows), ['e1'], '2026-11-14T10:00:00Z');
    const [claimed] = rows;
    expect(claimed?.confirmation_email_sent_at).toBe('2026-11-14T10:00:00Z');
    expect(claimed?.confirmation_email_status).toBe('sent');

    // The scheduled sender's audience: sent_at IS NULL and status in (pending, failed).
    const scheduled = readFileSync(
      new URL('../send-confirmation-email/index.ts', import.meta.url),
      'utf8'
    );
    expect(scheduled).toContain(".is('confirmation_email_sent_at', null)");
    expect(scheduled).toContain(".in('confirmation_email_status', ['pending', 'failed'])");
    const inAudience =
      claimed?.confirmation_email_sent_at === null &&
      ['pending', 'failed'].includes(claimed?.confirmation_email_status ?? '');
    expect(inAudience).toBe(false);
  });

  it('a released claim returns the entries to the scheduled sender as the retry path', async () => {
    const rows = [unsent('e1')];
    const client = fakeEntries(rows);
    await claimSubmissionEntries(client, ['e1'], '2026-11-14T10:00:00Z');
    await releaseSubmissionClaim(client, ['e1']);
    expect(rows[0]).toMatchObject({
      confirmation_email_sent_at: null,
      confirmation_email_status: 'failed',
    });
  });
});

describe('parseEntryIds', () => {
  it('accepts a de-duplicated list of ids and rejects anything else', () => {
    expect(parseEntryIds(['a', 'a', 'b'])).toEqual(['a', 'b']);
    expect(parseEntryIds([])).toBeNull();
    expect(parseEntryIds('a')).toBeNull();
    expect(parseEntryIds([1])).toBeNull();
    expect(parseEntryIds(Array.from({ length: 101 }, (_, i) => `e${i}`))).toBeNull();
  });
});

describe('submissionIdempotencyKey', () => {
  it('is derived from the claimed entries, in any order, and differs for other entries', async () => {
    const a = await submissionIdempotencyKey('reg-1', ['e1', 'e2']);
    expect(await submissionIdempotencyKey('reg-1', ['e2', 'e1'])).toBe(a);
    expect(await submissionIdempotencyKey('reg-1', ['e3'])).not.toBe(a);
  });
});

describe('summarizeSubmission', () => {
  it('totals the submission entries and names the unpaid check or cash method', () => {
    expect(
      summarizeSubmission([
        { entry_fee: 25, payment_method: 'check', payment_status: 'pending' },
        { entry_fee: 20.5, payment_method: 'check', payment_status: 'pending' },
      ])
    ).toEqual({ totalCents: 4550, payAtShow: 'check' });
    expect(
      summarizeSubmission([{ entry_fee: 25, payment_method: 'cash', payment_status: 'pending' }])
        .payAtShow
    ).toBe('cash');
  });

  it('says nothing is owed at the show when the entries are already paid', () => {
    expect(
      summarizeSubmission([{ entry_fee: 25, payment_method: 'check', payment_status: 'paid' }])
        .payAtShow
    ).toBeUndefined();
  });
});
