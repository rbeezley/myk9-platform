import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateCSPPolicy } from '@/config/security';

// @react-pdf/renderer pulls in yoga-layout, whose wasm is inlined as a base64 data: URL.
// It fetch()es that URL (connect-src data:) and compiles it (script-src 'wasm-unsafe-eval').
// Dev and e2e never apply the vercel.json headers, so only this contract catches a regression.
const appRoot = resolve(__dirname, '../../..');
const vercelConfig = JSON.parse(readFileSync(resolve(appRoot, 'vercel.json'), 'utf8')) as {
  headers: Array<{ headers: Array<{ key: string; value: string }> }>;
};
const productionCsp = vercelConfig.headers
  .flatMap(entry => entry.headers)
  .find(header => header.key === 'Content-Security-Policy')?.value;

function directiveSources(policy: string | undefined, name: string): string[] {
  const directive = policy?.split(';').find(part => part.trim().startsWith(`${name} `));
  return directive ? directive.trim().split(/\s+/).slice(1) : [];
}

describe('PDF renderer CSP contract', () => {
  it.each([
    ['vercel.json', productionCsp],
    ['generateCSPPolicy(production)', generateCSPPolicy('production')],
  ])('%s lets the renderer load and compile its wasm without unsafe-eval', (_label, policy) => {
    expect(policy).toBeDefined();
    expect(directiveSources(policy, 'connect-src')).toContain('data:');
    expect(directiveSources(policy, 'script-src')).toContain("'wasm-unsafe-eval'");
    expect(directiveSources(policy, 'script-src')).not.toContain("'unsafe-eval'");
    expect(directiveSources(policy, 'default-src')).not.toContain("'unsafe-eval'");
  });
});
