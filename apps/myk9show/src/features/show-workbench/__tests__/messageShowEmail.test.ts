import { describe, expect, it } from 'vitest';
import { parseMessageShowEmailResult } from '../messageShowEmail';

describe('parseMessageShowEmailResult', () => {
  it('carries the history-write failure flag through to the client', () => {
    expect(
      parseMessageShowEmailResult({
        email_recipients: 3,
        email_sent: 3,
        email_failed: 0,
        email_missing: [],
        email_log_failed: true,
      })
    ).toMatchObject({ recipients: 3, sent: 3, logFailed: true });
  });

  it('defaults logFailed to false', () => {
    expect(parseMessageShowEmailResult({ email_recipients: 1 })?.logFailed).toBe(false);
  });
});
