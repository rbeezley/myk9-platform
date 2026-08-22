import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const standardVerifier = readFileSync(resolve(__dirname, 'standardWebhookSignature.ts'), 'utf8');
const pushAuth = readFileSync(resolve(__dirname, 'pushWebhookAuth.ts'), 'utf8');
const functionSecret = readFileSync(resolve(__dirname, 'functionSecret.ts'), 'utf8');
const resendWebhook = readFileSync(resolve(__dirname, '../resend-webhook/index.ts'), 'utf8');

describe('shared webhook authentication contracts', () => {
  it('routes Standard-Webhooks and push bearer comparison through one timing-safe primitive', () => {
    expect(standardVerifier).toContain("from './timingSafeEqual.ts'");
    expect(standardVerifier).not.toMatch(/function timingSafeEqual/);

    // Bearer comparison lives in `functionSecret.ts` now, shared by the push
    // triggers and `generate-trial-packet`. What must stay true is that every
    // caller reaches the one primitive and none of them grows an `===`.
    expect(functionSecret).toContain("from './timingSafeEqual.ts'");
    expect(functionSecret).toContain('timingSafeEqual(authHeader, `Bearer ${secret}`)');
    expect(functionSecret).not.toMatch(/function timingSafeEqual/);
    expect(pushAuth).toContain("from './functionSecret.ts'");
    expect(pushAuth).toContain("requireFunctionSecret(req, 'PUSH_WEBHOOK_SECRET'");
    expect(pushAuth).not.toMatch(/authHeader\s*===/);
  });

  it('routes Resend verification through the shared Standard-Webhooks verifier', () => {
    expect(resendWebhook).toContain("from '../_shared/standardWebhookSignature.ts'");
    expect(resendWebhook).toContain('verifyStandardWebhookSignature({');
    expect(resendWebhook).not.toContain("from './signature.ts'");
    expect(resendWebhook).not.toContain('matchesAnySignature');
  });
});
