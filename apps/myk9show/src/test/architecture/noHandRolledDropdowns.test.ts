/**
 * A popup pinned with `absolute ... top-full` can never escape the fold.
 *
 * `top-full` places the popup directly below its trigger UNCONDITIONALLY —
 * there is no branch in that markup that could flip it upward or bound its
 * height. Measured on staging at 1280x600: the bottom row of
 * `/club-admin/members` had a trigger at y=532 with 24px of space beneath it
 * and a 573px popup, so 553px of the menu rendered below the viewport,
 * including "Grant Show Access" and "Remove Member". Wheeling over the visible
 * sliver scrolled the table, not the menu.
 *
 * This cost a long debugging detour because the symptom looked like a
 * collision-avoidance bug in the shared `DropdownMenu`, and two rounds of fixes
 * were applied THERE — to a component the broken page never rendered. Tests
 * asserting the shared primitive's CSS passed the whole time and proved
 * nothing. Hence this guard: it looks for the pattern at its source rather
 * than for a property of the component we hope is being used.
 *
 * Use `DropdownMenu` from `@/components/ui/dropdown-menu` instead. It portals
 * to the body, flips on collision, and bounds itself to `--available-height`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'node:fs';

const SRC = join(__dirname, '../..');

/**
 * Dev-only or intentionally-unshipped surfaces. Each entry needs a reason —
 * "it's just a prototype" is only acceptable while the route is DEV-gated.
 */
const ALLOWED = new Map<string, string>([
  [
    'pages/ShowDetailsPrototype.tsx',
    'Dev-only route: publicRoutes.tsx renders it behind import.meta.env.DEV, so it never reaches a user.',
  ],
]);

/**
 * A RATCHET, not an allowlist. Every entry carries the same bottom-of-viewport
 * bug the club-members menu had; none has been measured or fixed. This list may
 * only shrink. Adding to it is the thing this test exists to prevent.
 *
 * All five remaining entries are search, autocomplete, or notification panels —
 * same overflow exposure, but `DropdownMenu` is the WRONG replacement. A
 * `role="menu"` promises a roving-focus contract where Arrow keys move a single
 * focus point and Tab exits; that is right for a list of commands and wrong for
 * a list of suggestions you type against, where the input must keep focus.
 * Each needs a Popover or Combobox, not a mechanical swap.
 */
const PRE_EXISTING = new Set<string>();

function sourceFiles(): string[] {
  return globSync('**/*.tsx', { cwd: SRC })
    .map(p => p.replace(/\\/g, '/'))
    .filter(p => !p.includes('.test.') && !p.includes('/test/'));
}

describe('no hand-rolled dropdown popups', () => {
  const offenders: Array<{ file: string; line: number; text: string }> = [];

  for (const rel of sourceFiles()) {
    const lines = readFileSync(join(SRC, rel), 'utf8').split('\n');
    lines.forEach((line, i) => {
      // The signature of the trap: absolutely positioned AND pinned to the
      // trigger's bottom edge. Either alone is fine.
      if (/className=/.test(line) && /\babsolute\b/.test(line) && /\btop-full\b/.test(line)) {
        offenders.push({ file: rel, line: i + 1, text: line.trim().slice(0, 100) });
      }
    });
  }

  it('finds source files to scan', () => {
    // Guards against the check silently covering nothing.
    expect(sourceFiles().length).toBeGreaterThan(100);
  });

  it('adds no new popup pinned with `absolute top-full`', () => {
    const unexpected = offenders.filter(o => !ALLOWED.has(o.file) && !PRE_EXISTING.has(o.file));
    expect(
      unexpected.map(o => `${o.file}:${o.line} — ${o.text}`),
      'Use DropdownMenu from @/components/ui/dropdown-menu — it portals, flips, and bounds its height.'
    ).toEqual([]);
  });

  it('never lets the pre-existing ratchet grow', () => {
    // A fixed file must leave the list, so the count only ever falls.
    const stillBroken = [...PRE_EXISTING].filter(f => offenders.some(o => o.file === f));
    expect(
      stillBroken.length,
      'A file was fixed but left in PRE_EXISTING — remove it so the ratchet keeps its teeth.'
    ).toBe(PRE_EXISTING.size);
  });

  it('keeps the allowlist honest', () => {
    // An allowlist entry that no longer matches anything is stale — delete it,
    // so the list never grows into a place where real offenders hide.
    for (const file of ALLOWED.keys()) {
      expect(
        offenders.some(o => o.file === file),
        `${file} is allowlisted but no longer has the pattern — remove the entry.`
      ).toBe(true);
    }
  });
});
