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

const EXPECTED_FRAME_SRC = [
  "'self'",
  'blob:',
  'https://challenges.cloudflare.com',
  'https://www.youtube-nocookie.com',
];

describe('Club overview video deployment contract (MYK9-2374)', () => {
  it.each([
    ['vercel.json', productionCsp],
    ['generateCSPPolicy', generateCSPPolicy('production')],
  ])('%s allows exactly the expected frame sources', (_source, csp) => {
    const tokens = frameSrc(csp)?.split(/\s+/).slice(1);
    // youtu.be, youtube.com and ytimg hosts are not needed: the player is the nocookie embed.
    expect(tokens).toEqual(EXPECTED_FRAME_SRC);
  });
});
