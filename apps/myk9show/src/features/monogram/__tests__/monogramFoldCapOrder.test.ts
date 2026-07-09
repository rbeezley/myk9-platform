/**
 * exhibitor-ux-remediation 6.3 (Codex review catch): the short-viewport hero
 * fold caps (`@media (max-height: ...)`) and the mobile width query
 * (`@media (max-width: 900px)`) both set `.mg-hero` padding with equal
 * specificity + `!important`. On a viewport that is BOTH narrow (≤900px) and
 * short, they match together and source order decides the winner — so the
 * height caps MUST come after the width query or they silently lose and the
 * hero keeps its taller mobile padding. This pins that ordering.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const css = readFileSync(join(__dirname, '..', 'monogram.css'), 'utf-8');

describe('monogram.css — hero fold-cap cascade order', () => {
  it('declares the max-height fold caps AFTER the max-width:900px block', () => {
    const widthQuery = css.indexOf('@media (max-width: 900px)');
    const heightCap800 = css.indexOf('@media (max-height: 800px)');
    const heightCap620 = css.indexOf('@media (max-height: 620px)');

    expect(widthQuery).toBeGreaterThan(-1);
    expect(heightCap800).toBeGreaterThan(-1);
    expect(heightCap620).toBeGreaterThan(-1);

    // Later in the source = wins the cascade at equal specificity.
    expect(heightCap800).toBeGreaterThan(widthQuery);
    expect(heightCap620).toBeGreaterThan(widthQuery);
  });
});
