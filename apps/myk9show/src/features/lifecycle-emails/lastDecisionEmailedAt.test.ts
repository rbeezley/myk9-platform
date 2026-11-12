import { describe, expect, it } from 'vitest';
import { latestDecisionEmailedAt } from './lastDecisionEmailedAt';
import type { EntryDecisionEmailJob, EntryDecisionEmailStatus } from './api';

const job = (sentAt: string | null) => ({ sentAt }) as EntryDecisionEmailJob;
const status = (
  entryId: string,
  sent: string | null,
  correction: string | null = null
): EntryDecisionEmailStatus => ({
  entryId,
  readyJob: null,
  sentDecisionJob: sent ? job(sent) : null,
  sentCorrectionJob: correction ? job(correction) : null,
});

describe('latestDecisionEmailedAt (MYK9-1800)', () => {
  it('uses the sent job when the email log is empty', () => {
    expect(
      latestDecisionEmailedAt(undefined, ['e1', 'e2'], { e2: status('e2', '2026-11-12T10:00:00Z') })
    ).toBe('2026-11-12T10:00:00Z');
  });

  it('takes the newer of the log and the jobs, including corrections', () => {
    const map = { e1: status('e1', '2026-11-12T10:00:00Z', '2026-11-12T12:00:00Z') };
    expect(latestDecisionEmailedAt('2026-11-12T11:00:00Z', ['e1'], map)).toBe(
      '2026-11-12T12:00:00Z'
    );
    expect(latestDecisionEmailedAt('2026-11-13T00:00:00Z', ['e1'], map)).toBe(
      '2026-11-13T00:00:00Z'
    );
  });

  it('is undefined when nothing was sent', () => {
    expect(latestDecisionEmailedAt(undefined, ['e1'], { e1: status('e1', null) })).toBeUndefined();
    expect(latestDecisionEmailedAt(undefined, ['e1'], undefined)).toBeUndefined();
  });
});
