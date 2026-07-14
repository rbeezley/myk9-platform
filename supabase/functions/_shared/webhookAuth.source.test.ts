import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const standardVerifier = readFileSync(resolve(__dirname, 'standardWebhookSignature.ts'), 'utf8');
const pushAuth = readFileSync(resolve(__dirname, 'pushWebhookAuth.ts'), 'utf8');
const resendWebhook = readFileSync(resolve(__dirname, '../resend-webhook/index.ts'), 'utf8');

describe('shared webhook authentication contracts', () => {
  it('routes Standard-Webhooks and push bearer comparison through one timing-safe primitive', () => {
    expect(standardVerifier).toContain("from './timingSafeEqual.ts'");
    expect(pushAuth).toContain("from './timingSafeEqual.ts'");
    expect(standardVerifier).not.toMatch(/function timingSafeEqual/);
    expect(pushAuth).toContain('timingSafeEqual(authHeader, `Bearer ${webhookSecret}`)');
  });

  it('routes Resend verification through the shared Standard-Webhooks verifier', () => {
    expect(resendWebhook).toContain("from '../_shared/standardWebhookSignature.ts'");
    expect(resendWebhook).toContain('verifyStandardWebhookSignature({');
    expect(resendWebhook).not.toContain("from './signature.ts'");
    expect(resendWebhook).not.toContain('matchesAnySignature');
  });
});
