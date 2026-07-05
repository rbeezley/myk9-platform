import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appRoot = process.cwd();

function read(relPath: string): string {
  return readFileSync(join(appRoot, relPath), 'utf8');
}

// Source-text regression test pinning the motion-language duration/easing tokens
// in tailwind.config.js. These are the single source of truth referenced across
// myK9Show + ringside (see docs/plan-motion-consistency.md); a rename or value
// drift here silently changes every animation, so pin the exact names + values.
describe('motion-language tokens (tailwind.config.js)', () => {
  const tailwind = read('tailwind.config.js');

  describe('transitionDuration tokens', () => {
    it('defines duration-micro = 150ms', () => {
      expect(tailwind).toMatch(/micro:\s*'150ms'/);
    });
    it('defines duration-state = 200ms', () => {
      expect(tailwind).toMatch(/state:\s*'200ms'/);
    });
    it('defines duration-enter = 250ms', () => {
      expect(tailwind).toMatch(/enter:\s*'250ms'/);
    });
    it('defines duration-layout = 350ms', () => {
      expect(tailwind).toMatch(/layout:\s*'350ms'/);
    });
    it('declares a transitionDuration block', () => {
      expect(tailwind).toContain('transitionDuration:');
    });
  });

  describe('transitionTimingFunction tokens', () => {
    it('defines ease-enter as the ease-out-expo curve', () => {
      // key `enter` yields the `ease-enter` utility
      expect(tailwind).toMatch(/enter:\s*'cubic-bezier\(0\.16, 1, 0\.3, 1\)'/);
    });
    it('defines ease-exit as ease-in', () => {
      expect(tailwind).toMatch(/exit:\s*'ease-in'/);
    });
  });
});
