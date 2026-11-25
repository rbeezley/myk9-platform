import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateCSPPolicy } from '@/config/security';

const vercelConfig = JSON.parse(
  readFileSync(resolve(__dirname, '../../../vercel.json'), 'utf8')
) as { headers: Array<{ headers: Array<{ key: string; value: string }> }> };
const productionCsp = vercelConfig.headers
  .flatMap(entry => entry.headers)
  .find(header => header.key === 'Content-Security-Policy')?.value;

const frameSrc = (csp: string | undefined) =>
  csp
    ?.split(';')
    .map(directive => directive.trim())
    .find(directive => directive.startsWith('frame-src '));

describe('Club overview video deployment contract (MYK9-2374)', () => {
  it.each([
    ['vercel.json', productionCsp],
    ['generateCSPPolicy', generateCSPPolicy('production')],
  ])(
    '%s lets the homepage player load from the privacy-enhanced YouTube domain',
    (_source, csp) => {
      expect(frameSrc(csp)).toContain('https://www.youtube-nocookie.com');
    }
  );

  it('allows no other YouTube host', () => {
    expect(productionCsp).not.toMatch(/https:\/\/(www\.)?youtube\.com/);
  });
});
