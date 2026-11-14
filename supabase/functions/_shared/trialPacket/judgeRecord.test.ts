// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { payloadContainsRecipientFields } from './delivery.ts';
import {
  buildJudgeRecordDownloadFilename,
  buildJudgeRecordEmailHtml,
  decodeJudgeRecordPdf,
  isValidJudgeRecordPayload,
  judgeRecordIdempotencyKey,
  judgeRecordStoragePath,
  resolveJudgeRecordRecipient,
  uuidFromKey,
  type JudgeAssignmentFact,
  type JudgePersonFact,
  type JudgeRecordPayload,
} from './judgeRecord.ts';

const SHOW = 'a0000000-0000-4000-8000-000000000001';
const JUDGE = 'b0000000-0000-4000-8000-000000000002';
const DAY = '2026-12-07';

const assigned = (over: Partial<JudgeAssignmentFact> = {}): JudgeAssignmentFact => ({
  classId: 'c1',
  status: 'confirmed',
  classDeletedAt: null,
  classDate: DAY,
  ...over,
});
const person = (over: Partial<JudgePersonFact> = {}): JudgePersonFact => ({
  email: 'Pat@Example.com',
  firstName: 'Pat',
  lastName: 'Donovan',
  deletedAt: null,
  ...over,
});

describe('resolveJudgeRecordRecipient', () => {
  it('sends to the assigned judge at the email on file', () => {
    expect(
      resolveJudgeRecordRecipient({
        assignments: [assigned(), assigned({ classId: 'c2' })],
        person: person(),
        day: DAY,
      })
    ).toEqual({ kind: 'send', email: 'Pat@Example.com', judgeName: 'Pat Donovan', classCount: 2 });
  });

  it('gives a judge with no email a download and no send', () => {
    for (const email of [null, '', '   ', 'not-an-address']) {
      expect(
        resolveJudgeRecordRecipient({
          assignments: [assigned()],
          person: person({ email }),
          day: DAY,
        })
      ).toEqual({ kind: 'download', reason: 'no_email', judgeName: 'Pat Donovan' });
    }
  });

  it('does not count another day, an unconfirmed assignment, a deleted class or a show-level row', () => {
    for (const row of [
      assigned({ classDate: '2026-12-08' }),
      assigned({ status: 'invited' }),
      assigned({ status: 'declined' }),
      assigned({ classDeletedAt: '2026-12-01T00:00:00Z' }),
      assigned({ classId: null }),
    ]) {
      expect(
        resolveJudgeRecordRecipient({ assignments: [row], person: person(), day: DAY })
      ).toMatchObject({
        kind: 'download',
        reason: 'not_assigned',
      });
    }
  });

  it('never sends to a person who is missing or deleted', () => {
    expect(
      resolveJudgeRecordRecipient({ assignments: [assigned()], person: null, day: DAY })
    ).toMatchObject({
      kind: 'download',
    });
    expect(
      resolveJudgeRecordRecipient({
        assignments: [assigned()],
        person: person({ deletedAt: '2026-11-01' }),
        day: DAY,
      })
    ).toMatchObject({ kind: 'download', reason: 'not_assigned' });
  });
});

describe('judge record request', () => {
  const base: JudgeRecordPayload = { action: 'preview', showId: SHOW, judgeId: JUDGE, day: DAY };

  it('accepts a preview and a send, and nothing else', () => {
    expect(isValidJudgeRecordPayload(base)).toBe(true);
    expect(isValidJudgeRecordPayload({ ...base, action: 'send', pdfBase64: 'JVBERi0=' })).toBe(
      true
    );
    expect(isValidJudgeRecordPayload({ ...base, action: 'send' })).toBe(false);
    expect(isValidJudgeRecordPayload({ ...base, action: 'delete' as 'send' })).toBe(false);
  });

  it('refuses a bad id or a day that does not exist', () => {
    expect(isValidJudgeRecordPayload({ ...base, showId: 'x' })).toBe(false);
    expect(isValidJudgeRecordPayload({ ...base, judgeId: '../etc' })).toBe(false);
    expect(isValidJudgeRecordPayload({ ...base, day: '2026-02-30' })).toBe(false);
    expect(isValidJudgeRecordPayload({ ...base, day: '' })).toBe(false);
  });

  it('needs an attempt id to send again on purpose', () => {
    const send = { ...base, action: 'send' as const, pdfBase64: 'JVBERi0=' };
    expect(isValidJudgeRecordPayload({ ...send, sendAgain: true })).toBe(false);
    expect(isValidJudgeRecordPayload({ ...send, sendAgain: true, attemptId: SHOW })).toBe(true);
  });

  it('flags a caller-supplied recipient so the handler can refuse it', () => {
    for (const key of ['to', 'cc', 'recipients', 'recipientEmails', 'replyTo']) {
      expect(payloadContainsRecipientFields({ ...base, [key]: 'someone@example.com' })).toBe(true);
    }
    expect(payloadContainsRecipientFields(base)).toBe(false);
  });
});

describe('judge record file', () => {
  const pdf = (text: string) => btoa(text);

  it('decodes a PDF and refuses anything else', () => {
    expect(decodeJudgeRecordPdf(pdf('%PDF-1.4 body'))?.length).toBe(13);
    expect(decodeJudgeRecordPdf(pdf('<html>'))).toBeNull();
    expect(decodeJudgeRecordPdf('!!!not base64')).toBeNull();
    expect(decodeJudgeRecordPdf('')).toBeNull();
  });

  it('refuses a file over the limit before decoding it', () => {
    expect(decodeJudgeRecordPdf('A'.repeat(12 * 1024 * 1024))).toBeNull();
  });

  it('keys storage on judge, day and content, and the idempotency key on judge and day only', () => {
    const sha = 'f'.repeat(64);
    expect(judgeRecordStoragePath(SHOW, JUDGE, DAY, sha)).toBe(
      `${SHOW}/judge-records/${JUDGE}-${DAY}-ffffffffffffffff.pdf`
    );
    const key = judgeRecordIdempotencyKey({ showId: SHOW, judgeId: JUDGE, day: DAY });
    expect(key).toBe(`judge-record-${SHOW}-${JUDGE}-${DAY}`);
    expect(judgeRecordIdempotencyKey({ showId: SHOW, judgeId: JUDGE, day: '2026-12-08' })).not.toBe(
      key
    );
  });

  it('makes a stable uuid from a key', async () => {
    const first = await uuidFromKey('a');
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await uuidFromKey('a')).toBe(first);
    expect(await uuidFromKey('b')).not.toBe(first);
  });

  it('names the file safely', () => {
    expect(buildJudgeRecordDownloadFilename('Heartland "Scent" Work\r\n', DAY)).toBe(
      'heartland-scent-work-2026-12-07-judges-record.pdf'
    );
  });

  it('writes an email that names the expiry, says to save, and carries no judge details', () => {
    const html = buildJudgeRecordEmailHtml({
      showName: 'Heartland <b>Scent</b>',
      day: DAY,
      signedUrl: 'https://storage.example/signed?a=1&b=2',
      expiresAt: '2027-01-06T12:00:00.000Z',
    });
    expect(html).toContain('January 6, 2027');
    expect(html).toContain('Save the file');
    expect(html).toContain('The signed paper is the official record');
    expect(html).toContain('Heartland &lt;b&gt;Scent&lt;/b&gt;');
    expect(html).toContain('a=1&amp;b=2');
    expect(html).not.toMatch(/Pat|Donovan|@/);
    expect(html).not.toContain('—');
  });
});
