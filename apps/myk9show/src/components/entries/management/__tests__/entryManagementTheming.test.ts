/**
 * Watchlist pin for the Entry Management tree (impeccable p3, findings A11/A12).
 *
 * Project watchlist item 1: a raw Tailwind palette class that exists in only one
 * theme direction renders wrong in the other. `PullReconciliationCard` carried
 * `bg-green-50` / `bg-orange-50` / `bg-gray-50`, whose backgrounds are fixed
 * near-white, so in dark mode they were the only glaring light patches on the
 * page. `EmailStatusIcon` carried `text-green-500` (2.04:1 on `--card:#ffffff`)
 * and `text-yellow-500` (1.92:1), both under WCAG 1.4.11's 3:1 non-text floor.
 *
 * This is a source-text check, which can only prove someone typed the token --
 * it cannot prove the rendered colour. Its job is narrow and honest: catch a
 * raw palette literal REAPPEARING in these files. The rendered-behaviour half
 * is covered by the components' own tests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8');
}

/**
 * Palette families that carry status meaning. A literal from one of these in a
 * className is the watchlist bug; the semantic tokens (`--success`, `--warning`,
 * `--info`, `--destructive`, `--muted`) are theme-aware and are the fix.
 */
const RAW_STATUS_PALETTE =
  /className="[^"]*\b(?:bg|text|border)-(?:green|emerald|orange|amber|yellow|red|rose|blue|sky|gray|slate|zinc|neutral)-\d{2,3}/;

describe('Entry Management theming (watchlist 1)', () => {
  it('PullReconciliationCard uses semantic tokens, not raw palette literals', () => {
    const source = read('components/entries/management/PullReconciliationCard.tsx');

    expect(source).not.toMatch(RAW_STATUS_PALETTE);
    expect(source).toContain('bg-success/10 text-success');
    expect(source).toContain('bg-warning/10 text-warning');
  });

  it('the unknown pull timing stays neutral rather than borrowing a status colour', () => {
    const source = read('components/entries/management/PullReconciliationCard.tsx');

    // "Timing unknown" is not a good or bad outcome; colouring it as one would
    // assert a judgement the data does not support.
    expect(source).toMatch(/bg-muted text-muted-foreground">\s*Timing unknown/);
  });

  it('EmailStatusIcon carries delivery status in text, not colour alone', () => {
    const source = read('components/entries/EmailStatusIcon.tsx');

    expect(source).not.toMatch(RAW_STATUS_PALETTE);
    // Every branch that renders an icon also renders an sr-only label, so the
    // state survives when colour and `title` both go unread.
    const iconBranches = source.match(/<(?:CheckCircle|Clock|AlertTriangle)\b/g) ?? [];
    const srOnlyLabels = source.match(/className="sr-only"/g) ?? [];
    expect(iconBranches.length).toBeGreaterThan(0);
    expect(srOnlyLabels).toHaveLength(iconBranches.length);
  });

  it('every status icon is hidden from assistive tech, since the text carries it', () => {
    const source = read('components/entries/EmailStatusIcon.tsx');
    const icons = source.match(/<(?:CheckCircle|Clock|AlertTriangle)\b[^>]*>/g) ?? [];

    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(icon).toContain('aria-hidden');
    }
  });
});
