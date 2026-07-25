import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateCSPPolicy } from '@/config/security';

const appRoot = resolve(__dirname, '../../..');
const vercelConfig = JSON.parse(readFileSync(resolve(appRoot, 'vercel.json'), 'utf8')) as {
  headers: Array<{ headers: Array<{ key: string; value: string }> }>;
};
const envExample = readFileSync(resolve(appRoot, '.env.example'), 'utf8');
const productionCsp = vercelConfig.headers
  .flatMap(entry => entry.headers)
  .find(header => header.key === 'Content-Security-Policy')?.value;

describe('Turnstile deployment contract', () => {
  it('allows Cloudflare challenge scripts, connections, and frames in both production CSP sources', () => {
    expect(productionCsp).toContain("script-src 'self' https://challenges.cloudflare.com");
    expect(productionCsp).toContain('connect-src');
    expect(productionCsp).toContain("connect-src 'self' https://challenges.cloudflare.com");
    expect(productionCsp).toContain("frame-src 'self' https://challenges.cloudflare.com");

    const runtimeCsp = generateCSPPolicy('production');
    expect(runtimeCsp).toContain("script-src 'self' https://challenges.cloudflare.com");
    expect(runtimeCsp).toContain('connect-src');
    expect(runtimeCsp).toContain("connect-src 'self' https://challenges.cloudflare.com");
    expect(runtimeCsp).toContain("frame-src 'self' https://challenges.cloudflare.com");
  });

  it('documents the public Turnstile site key without a client-side secret', () => {
    expect(envExample).toContain('VITE_TURNSTILE_SITE_KEY=');
    expect(envExample).not.toContain('VITE_TURNSTILE_SECRET');
  });
});
