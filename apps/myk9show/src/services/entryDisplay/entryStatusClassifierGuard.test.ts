import { readFileSync, globSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * GUARD: the canonical entry_status lifecycle is classified for display in exactly
 * one place — `services/entryDisplay/`. If a new independent mapper appears
 * elsewhere, the surfaces can silently disagree again (the 2026-06-18 walk
 * divergence: "withdrawn" vs "Upcoming", phantom "Section A"). This test fails
 * the moment such a mapper is reintroduced.
 *
 * How it detects one: it looks for the two raw `entry_status` values that are
 * UNIQUE to the lifecycle and appear nowhere else — `'promotion-expired'` and
 * `'move-up-requested'` — being used as a `switch` case or an equality
 * comparison. A comprehensive raw classifier must handle those states; a switch
 * on the presentation-neutral `EntryStatusKind` never spells them this way (its
 * values are `move_up_requested` / `not_accepted`, not the hyphenated raw form),
 * so kind-based helpers (getEntryStatusClasses, mapClassEntryStatus) are NOT
 * flagged. UI→DB writers (mapStatusToDb) use `return '...'`, also not flagged.
 */

const SRC_ROOT = resolve(__dirname, '../..');

// Raw-only lifecycle literals: present on `entry_status`, never an EntryStatusKind.
const RAW_ONLY_LITERALS = ['promotion-expired', 'move-up-requested'] as const;

// Classification shapes: `case 'x'` and `=== 'x'` / `!== 'x'` (single OR double quote).
const CLASSIFY_PATTERNS = RAW_ONLY_LITERALS.flatMap(lit => [
  new RegExp(`case\\s+['"]${lit}['"]`),
  new RegExp(`[=!]==\\s*['"]${lit}['"]`),
  new RegExp(`['"]${lit}['"]\\s*[=!]==`),
]);

function listSourceFiles(): string[] {
  return globSync('**/*.{ts,tsx}', { cwd: SRC_ROOT })
    .filter(rel => !rel.includes('services/entryDisplay/'))
    .filter(rel => !rel.includes('.test.'))
    .filter(rel => !rel.includes('__tests__/'))
    // globSync can surface directories whose name ends in .ts/.tsx; keep files only.
    .filter(rel => statSync(resolve(SRC_ROOT, rel)).isFile());
}

describe('entry-status classifier guard', () => {
  it('classifies raw entry_status for display ONLY inside services/entryDisplay/', () => {
    const offenders: string[] = [];

    for (const rel of listSourceFiles()) {
      const source = readFileSync(resolve(SRC_ROOT, rel), 'utf8');
      if (CLASSIFY_PATTERNS.some(pattern => pattern.test(source))) {
        offenders.push(rel);
      }
    }

    expect(
      offenders,
      `Independent entry_status classification found outside services/entryDisplay/:\n` +
        `${offenders.join('\n')}\n\n` +
        `Route raw entry_status through getEntryStatusKind / getEntryDisplay instead ` +
        `(see services/entryDisplay/entryDisplaySelectors.ts).`
    ).toEqual([]);
  });

  it('still recognizes the canonical classifier as the home for those literals', () => {
    // Sanity: the selector genuinely owns these literals, so the guard above is
    // testing a real invariant and not a perpetually-empty search.
    const selector = readFileSync(
      resolve(SRC_ROOT, 'services/entryDisplay/entryDisplaySelectors.ts'),
      'utf8'
    );
    expect(selector).toContain("case 'promotion-expired'");
    expect(selector).toContain("case 'move-up-requested'");
  });
});
