/**
 * Source-text regression guard (impeccable sweep page #7 — public show landing).
 *
 * The exhibitor "Enter This Show" CTA (in ShowExhibitorView, extracted from
 * ShowDetailsPage in the show-detail consolidation) must use the shared Button
 * (var(--primary) + semantic focus ring) so it honors all four
 * user accents (Clay/Grove/Dusk/Heather). A prior version hardcoded the Clay hex
 * and a cool #3898ec focus ring, which broke under the other three accents — a
 * defect typecheck and render-snapshot tests are both blind to.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(__dirname, '../ShowExhibitorView.tsx'), 'utf8');

describe('ShowExhibitorView entry CTA — accent-safe tokens', () => {
  it('does not hardcode the Clay accent or a cool focus-ring hex', () => {
    expect(source).not.toContain('#c96442');
    expect(source).not.toContain('#b45a3a');
    expect(source).not.toContain('#3898ec');
  });

  it('routes the entry CTA through the shared Button component', () => {
    // The CTA is conditional on entryStatus.canEnter; it must be a <Button>
    // (default = filled var(--primary)), not a raw <button> with hardcoded color.
    expect(source).toContain("{hasUserEntries ? 'Add or Change Entries' : 'Enter This Show'}");
    expect(source).not.toMatch(/bg-\[#c96442\]/);
  });
});
