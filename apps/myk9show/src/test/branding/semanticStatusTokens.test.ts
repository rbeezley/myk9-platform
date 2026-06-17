import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appRoot = process.cwd();

function read(relPath: string): string {
  return readFileSync(join(appRoot, relPath), 'utf8');
}

describe('semantic status token foundation', () => {
  const css = read('src/index.css');
  const tailwind = read('tailwind.config.js');

  describe('index.css — light values in :root', () => {
    it('defines --success as an RGB triplet that passes WCAG AA as text', () => {
      // green-700 (21 128 61): 4.69:1 as text on page, 5.02:1 on card, 5.02:1 white-on-bg.
      // green-600 (22 163 74) failed AA as small text (~3.1:1) — see Lane 3 hardening.
      expect(css).toContain('--success: 21 128 61');
    });
    it('defines --success-foreground', () => {
      expect(css).toContain('--success-foreground: 255 255 255');
    });
    it('defines --warning as an RGB triplet', () => {
      expect(css).toContain('--warning: 217 119 6');
    });
    it('defines --warning-foreground', () => {
      expect(css).toContain('--warning-foreground: 255 255 255');
    });
    it('defines --info as an RGB triplet', () => {
      expect(css).toContain('--info: 37 99 235');
    });
    it('defines --info-foreground', () => {
      expect(css).toContain('--info-foreground: 255 255 255');
    });
    it('defines --destructive as an RGB triplet (not hex)', () => {
      expect(css).toContain('--destructive: 239 68 68');
      expect(css).not.toContain('--destructive: #ef4444');
    });
  });

  describe('index.css — dark values in .dark', () => {
    it('defines dark --success', () => {
      expect(css).toContain('--success: 74 222 128');
    });
    it('defines dark --warning', () => {
      expect(css).toContain('--warning: 251 191 36');
    });
    it('defines dark --info', () => {
      expect(css).toContain('--info: 96 165 250');
    });
    it('defines dark --destructive as an RGB triplet (not hex)', () => {
      expect(css).toContain('--destructive: 220 38 38');
      expect(css).not.toContain('--destructive: #dc2626');
    });
  });

  describe('tailwind.config.js — semantic keys present', () => {
    it('wires success with rgb alpha form', () => {
      expect(tailwind).toContain("DEFAULT: 'rgb(var(--success) / <alpha-value>)'");
    });
    it('wires warning with rgb alpha form', () => {
      expect(tailwind).toContain("DEFAULT: 'rgb(var(--warning) / <alpha-value>)'");
    });
    it('wires info with rgb alpha form', () => {
      expect(tailwind).toContain("DEFAULT: 'rgb(var(--info) / <alpha-value>)'");
    });
    it('wires destructive with rgb alpha form', () => {
      expect(tailwind).toContain("DEFAULT: 'rgb(var(--destructive) / <alpha-value>)'");
    });
  });

  describe('tailwind.config.js — deprecated aliases removed (Phase 3 complete)', () => {
    it('no longer contains success-green alias', () => {
      expect(tailwind).not.toContain("'success-green'");
    });
    it('no longer contains warning-orange alias', () => {
      expect(tailwind).not.toContain("'warning-orange'");
    });
    it('no longer contains error-red alias', () => {
      expect(tailwind).not.toContain("'error-red'");
    });
  });

  describe('index.css — deprecated CSS vars removed (Phase 3 complete)', () => {
    it('no longer defines --success-green', () => {
      expect(css).not.toContain('--success-green');
    });
    it('no longer defines --warning-orange', () => {
      expect(css).not.toContain('--warning-orange');
    });
    it('no longer defines --error-red', () => {
      expect(css).not.toContain('--error-red');
    });
  });

  describe('theme-preferences.css — high-contrast overrides use RGB triplets', () => {
    const prefs = read('src/styles/theme-preferences.css');

    it('.high-contrast --destructive is an RGB triplet', () => {
      expect(prefs).toContain('--destructive: 220 38 38');
      expect(prefs).not.toContain('--destructive: #dc2626');
    });
    it('.dark.high-contrast --destructive is an RGB triplet', () => {
      expect(prefs).toContain('--destructive: 239 68 68');
      expect(prefs).not.toContain('--destructive: #ef4444');
    });
    it('.dark.high-contrast --destructive-foreground is black as RGB triplet', () => {
      expect(prefs).toContain('--destructive-foreground: 0 0 0');
    });
  });
});
