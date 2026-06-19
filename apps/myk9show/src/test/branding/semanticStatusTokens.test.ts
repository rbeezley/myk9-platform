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

  // Scope assertions to the correct mode. Light tokens live in the :root /
  // light blocks that precede the `.dark {` override block; dark overrides
  // live inside it. Splitting on `.dark {` stops a light-mode assertion from
  // passing off the dark block's value (and vice versa) — e.g. both modes
  // legitimately carry a `--destructive` whose values must NOT be conflated.
  const darkBlockStart = css.indexOf('.dark {');
  const lightCss = css.slice(0, darkBlockStart);
  const darkCss = css.slice(darkBlockStart);

  it('has a .dark block to anchor the light/dark split', () => {
    expect(darkBlockStart).toBeGreaterThan(0);
  });

  describe('index.css — light values (before .dark block)', () => {
    it('defines --success as an RGB triplet that passes WCAG AA incl. the /10 tint pattern', () => {
      // green-800 (22 101 52): AA everywhere — 5.2:1 on the bg-success/10 page-tinted
      // surface, 6.3:1 white-on-solid. green-700 (21 128 61) passed on plain white (~5.1:1)
      // but the common bg-success/10 + text-success tint was only ~4.2:1 — see Lane 3.1.
      expect(lightCss).toContain('--success: 22 101 52');
      expect(lightCss).not.toContain('--success: 21 128 61');
    });
    it('defines --success-foreground', () => {
      expect(lightCss).toContain('--success-foreground: 255 255 255');
    });
    it('defines --warning as amber-800 (passes WCAG AA incl. the /10 tint pattern)', () => {
      // amber-800 (146 64 14): AA everywhere — 5.7:1 on the bg-warning/10 page-tinted
      // surface, 7.1:1 white-on-solid. amber-700 (180 83 9) passed solid text but the
      // common bg-warning/10 + text-warning tint was only ~4.1:1; amber-600 worse still.
      expect(lightCss).toContain('--warning: 146 64 14');
      expect(lightCss).not.toContain('--warning: 180 83 9');
      expect(lightCss).not.toContain('--warning: 217 119 6');
    });
    it('defines --warning-foreground', () => {
      expect(lightCss).toContain('--warning-foreground: 255 255 255');
    });
    it('defines --info as an RGB triplet', () => {
      expect(lightCss).toContain('--info: 37 99 235');
    });
    it('defines --info-strong as blue-800 for AA contrast on the /10 tint pattern', () => {
      expect(lightCss).toContain('--info-strong: 30 64 175');
    });
    it('defines --info-foreground', () => {
      expect(lightCss).toContain('--info-foreground: 255 255 255');
    });
    it('defines --destructive as red-700 (passes WCAG AA incl. the /10 tint pattern, not hex)', () => {
      // red-700 (185 28 28): AA everywhere — 5.1:1 on the bg-destructive/10 page-tinted
      // surface, 6.5:1 white-on-solid. red-600 (220 38 38) passed solid text but the
      // common bg-destructive/10 + text-destructive tint was only ~3.9:1; red-500 worse.
      // Asserted against lightCss so the dark-mode --destructive (220 38 38) can't satisfy it.
      expect(lightCss).toContain('--destructive: 185 28 28');
      expect(lightCss).not.toContain('--destructive: 220 38 38');
      expect(lightCss).not.toContain('--destructive: 239 68 68');
      expect(lightCss).not.toContain('--destructive: #ef4444');
    });
  });

  describe('index.css — dark values in .dark', () => {
    it('defines dark --success', () => {
      expect(darkCss).toContain('--success: 74 222 128');
    });
    it('defines dark --warning', () => {
      expect(darkCss).toContain('--warning: 251 191 36');
    });
    it('defines dark --info', () => {
      expect(darkCss).toContain('--info: 96 165 250');
    });
    it('defines dark --info-strong', () => {
      expect(darkCss).toContain('--info-strong: 147 197 253');
    });
    it('defines dark --destructive as an RGB triplet (not hex), scoped to .dark', () => {
      expect(darkCss).toContain('--destructive: 220 38 38');
      expect(darkCss).not.toContain('--destructive: 185 28 28');
      expect(darkCss).not.toContain('--destructive: #dc2626');
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
    it('wires info strong with rgb alpha form', () => {
      expect(tailwind).toContain("strong: 'rgb(var(--info-strong) / <alpha-value>)'");
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
