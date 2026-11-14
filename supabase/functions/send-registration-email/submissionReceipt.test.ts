// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import {
  claimSubmissionEntries,
  parseEntryIds,
  releaseClaimOnThrow,
  releaseSubmissionClaim,
  submissionIdempotencyKey,
  summarizeSubmission,
  type EntryClaimClient,
} from './submissionReceipt';

interface Row {
  id: string;
  receipt_email_sent_at: string | null;
  receipt_email_status: string;
  receipt_email_attempted_at?: string | null;
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
            .filter(r => ids.includes(r.id) && (!onlyUnsent || r.receipt_email_sent_at === null))
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
  receipt_email_sent_at: null,
  receipt_email_status: 'pending',
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

  it('stamps the receipt marker and leaves the pre-show confirmation marker untouched', async () => {
    const rows = [unsent('e1')];
    await claimSubmissionEntries(fakeEntries(rows), ['e1'], '2026-11-14T10:00:00Z');
    expect(rows[0]).toMatchObject({
      receipt_email_sent_at: '2026-11-14T10:00:00Z',
      receipt_email_status: 'sent',
      receipt_email_attempted_at: '2026-11-14T10:00:00Z',
      confirmation_email_sent_at: null,
      confirmation_email_status: 'pending',
    });
    // The scheduled pre-show sender still selects the entry: a receipt never suppresses it.
    const scheduled = readFileSync(
      new URL('../send-confirmation-email/index.ts', import.meta.url),
      'utf8'
    );
    expect(scheduled).toContain(".is('confirmation_email_sent_at', null)");
    expect(scheduled).toContain(".in('confirmation_email_status', ['pending', 'failed'])");
  });

  it('a released claim is marked failed for the retry sweep, receipt marker only', async () => {
    const rows = [unsent('e1')];
    const client = fakeEntries(rows);
    await claimSubmissionEntries(client, ['e1'], '2026-11-14T10:00:00Z');
    await releaseSubmissionClaim(client, ['e1']);
    expect(rows[0]).toMatchObject({
      receipt_email_sent_at: null,
      receipt_email_status: 'failed',
      confirmation_email_status: 'pending',
    });
    expect(rows[0]?.receipt_email_attempted_at).toEqual(expect.any(String));
  });
});

describe('releaseSubmissionClaim failure', () => {
  const failingClient = (message: string) =>
    ({
      from: () => ({
        update: () => ({ in: () => Promise.resolve({ error: { message } }) }),
      }),
    }) as unknown as EntryClaimClient;

  it('reports false and logs when the release itself fails, never swallowing it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await releaseSubmissionClaim(failingClient('db down'), ['e1'])).toBe(false);
    expect(log).toHaveBeenCalledWith(
      'Could not release the submission claim',
      expect.objectContaining({ message: 'db down' })
    );
    log.mockRestore();
  });

  it('reports true when the claim was handed back', async () => {
    expect(await releaseSubmissionClaim(fakeEntries([unsent('e1')]), ['e1'])).toBe(true);
  });
});

describe('releaseClaimOnThrow', () => {
  it('releases the claim and rethrows when the work throws before the send', async () => {
    const release = vi.fn().mockResolvedValue(true);
    await expect(
      releaseClaimOnThrow(release, async () => {
        throw new Error('club lookup timed out');
      })
    ).rejects.toThrow('club lookup timed out');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('leaves the claim alone when the work succeeds', async () => {
    const release = vi.fn().mockResolvedValue(true);
    expect(await releaseClaimOnThrow(release, async () => 'ok')).toBe('ok');
    expect(release).not.toHaveBeenCalled();
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
