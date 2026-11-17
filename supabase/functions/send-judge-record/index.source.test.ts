// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The order of the gates in the handler is the contract, and position in the source is the only
 * place it is visible. What each step does is covered in `deliverJudgeRecord.test.ts`.
 */
const source = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');

describe('send-judge-record handler contract', () => {
  it('refuses a caller-supplied recipient and a bad request before the database', () => {
    const reject = source.indexOf('payloadContainsRecipientFields(body)');
    const validate = source.indexOf('isValidJudgeRecordPayload(body)');
    const loadShow = source.indexOf('loadPacketShow(');
    expect(reject).toBeGreaterThan(0);
    expect(validate).toBeGreaterThan(reject);
    expect(loadShow).toBeGreaterThan(validate);
  });

  it('authorizes the caller before previewing or sending', () => {
    const authorize = source.indexOf('callerRoleAuthorizesPacket');
    const forbid = source.indexOf('throw new HttpError(403');
    const preview = source.indexOf('previewJudgeRecord(');
    const send = source.indexOf('sendJudgeRecord(');
    expect(authorize).toBeGreaterThan(0);
    expect(forbid).toBeGreaterThan(authorize);
    expect(preview).toBeGreaterThan(forbid);
    expect(send).toBeGreaterThan(forbid);
  });

  it('never reads a recipient from the body', () => {
    expect(source).not.toMatch(/body\.(to|cc|email|recipient)/);
  });
});
