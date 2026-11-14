// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { isReceiptSweepCaller } from './systemCaller';

const req = (secret?: string) =>
  new Request('https://example.test', {
    method: 'POST',
    headers: secret === undefined ? {} : { 'x-function-secret': secret },
  });
const env = (value: string | undefined) => (name: string) =>
  name === 'HERITAGE_CONFIRMATION_SECRET' ? value : undefined;

describe('isReceiptSweepCaller', () => {
  it('accepts the configured secret', () => {
    expect(isReceiptSweepCaller(req('s3cret'), env('s3cret'))).toBe(true);
  });

  it('rejects a wrong or missing secret', () => {
    expect(isReceiptSweepCaller(req('nope'), env('s3cret'))).toBe(false);
    expect(isReceiptSweepCaller(req(), env('s3cret'))).toBe(false);
  });

  it('never matches when no secret is configured, even an empty header', () => {
    expect(isReceiptSweepCaller(req(''), env(undefined))).toBe(false);
    expect(isReceiptSweepCaller(req(''), env(''))).toBe(false);
  });
});
