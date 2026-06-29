/**
 * Source-text regression across ALL styled wizard-completion receipts.
 *
 * Every show resolves to one of these renderers (getShowStyle defaults to
 * 'monogram', and STYLED_RECEIPT_BY_STYLE is exhaustive), so these — not the
 * plain ConfirmationStep — are the live confirmation surface. They are reached
 * only AFTER the entry is written (submit happens on the Payment step's Next),
 * so none of them may use the pre-submit "ready to submit" / "your entry is
 * ready" framing that implies work still remains. Pinned per the repo's
 * fs.readFileSync convention so a future theme tweak can't silently reinstate
 * the misleading copy on the real user-facing path.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const featuresDir = path.join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(path.join(featuresDir, rel), 'utf8');

const VARIANTS: Array<{ style: string; file: string }> = [
  { style: 'heritage', file: 'heritage/wizard/HeritageEntryReceived.tsx' },
  { style: 'headline', file: 'headline/wizard/HeadlineEntryReceived.tsx' },
  { style: 'monogram', file: 'monogram/wizard/MonogramEntryReceived.tsx' },
  { style: 'banner', file: 'banner/wizard/BannerEntryReceived.tsx' },
  { style: 'fieldGuide', file: 'fieldGuide/wizard/FieldGuideEntryReceived.tsx' },
  { style: 'gazette', file: 'gazette/wizard/GazetteEntryReceived.tsx' },
  { style: 'magazine', file: 'magazine/wizard/MagazineEntryReceived.tsx' },
  { style: 'poster', file: 'poster/wizard/PosterEntryReceived.tsx' },
];

describe('styled receipts — post-submit framing', () => {
  for (const { style, file } of VARIANTS) {
    it(`${style} receipt does not use pre-submit "ready to submit" framing`, () => {
      const source = read(file);
      expect(source.toLowerCase()).not.toContain('ready to submit');
      // "your entry is ready" was the ambiguous heritage/monogram/gazette/
      // magazine phrasing — also pre-submit in feel.
      expect(source.toLowerCase()).not.toContain('entry is ready');
    });

    it(`${style} receipt uses "submitted" framing`, () => {
      const source = read(file);
      expect(source.toLowerCase()).toContain('submitted');
    });
  }
});
