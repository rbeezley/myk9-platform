// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SetupSheet } from '../setupRules.types';
import { akcSetupSheet, ukcSetupSheet } from '../setupRules';

// Repo root is five levels up from this directory (apps/myk9show/src/features/registries/__tests__).
const RULEBOOK_DIR = resolve(__dirname, '../../../../../../docs/rulebooks');

/** The rulebook text has line breaks and " ." / " ," spacing artifacts; normalise both sides. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/ \./g, '.').replace(/ ,/g, ',').trim();
}

const RULEBOOKS: ReadonlyArray<readonly [string, SetupSheet, string]> = [
  ['UKC', ukcSetupSheet, 'ukc-nose-work-rules.txt'],
  ['AKC', akcSetupSheet, 'akc-scent-work-regulations.txt'],
];

describe.each(RULEBOOKS)('%s setup sheet footer notes', (_registry, sheet, file) => {
  const rulebook = normalize(readFileSync(resolve(RULEBOOK_DIR, file), 'utf8'));
  const excerpts = sheet.pages.flatMap(page =>
    page.notes.flatMap(note =>
      note.excerpts.map(excerpt => ({ page: page.id, heading: note.heading, ...excerpt }))
    )
  );

  it('has excerpts to check', () => {
    expect(excerpts.length).toBeGreaterThan(0);
    for (const page of sheet.pages) {
      for (const note of page.notes) expect(note.excerpts.length).toBeGreaterThan(0);
    }
  });

  it('quotes the rulebook word for word', () => {
    for (const excerpt of excerpts) {
      expect(
        rulebook.includes(normalize(excerpt.quote)),
        `${sheet.registryId} "${excerpt.heading}" note (${excerpt.cite}) quote not found in ${file}: "${excerpt.quote}"`
      ).toBe(true);
    }
  });

  it('cites a chapter and section for every quote', () => {
    for (const excerpt of excerpts) expect(excerpt.cite).toMatch(/^Ch\. \d+ §\d+/);
  });
});
