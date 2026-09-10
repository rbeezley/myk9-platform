import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Guard for one recurring class: a GLOBAL role boolean used to gate a
 * CLUB-SCOPED resource.
 *
 * `isSecretary` and `isAdmin` come from `hasRole()`, which answers "does this
 * user hold this role ANYWHERE". The server's manage predicates do not work
 * that way — they resolve to
 * `is_site_admin() OR is_club_admin(club) OR is_trial_secretary(club)`, all
 * scoped to the club that owns the record. Every time the two disagree, the app
 * offers a control the database then refuses.
 *
 * This has now recurred twice:
 *
 *   MYK9-123 gated Class and Trial staff controls, scoped `club_admin`, and
 *   left `secretary` global by omission.
 *   MYK9-458 found the same hole on `secretary` — Club A's secretary was
 *   offered "Generate new codes" on Club B's show, and the RPC refused it.
 *
 * A checklist line gets skipped; this does not. `canManageShowSurface(...)` in
 * utils/roleScopes.ts is the scoped predicate — use it, and pass the record's
 * own `clubId`.
 *
 * This is an INVENTORY, not a blessing. Each entry below records a decision
 * someone made. Adding a new `isSecretary || isAdmin` anywhere under src/ fails
 * this test until it is either routed through the scoped helper or added here
 * with a reason. Entries marked UNREVIEWED are pre-existing and suspected —
 * they are listed so the debt is visible rather than silently inherited, and tracked in
 * MYK9-464.
 */

const APP_SRC = resolve(import.meta.dirname, '../..');

/**
 * Matches the bare global gate in either operand order.
 *
 * `\s` spans newlines and the match runs over whole file contents, NOT
 * line-by-line: Prettier breaks a long condition after the `||`, so
 * `isSecretary ||\n  isAdmin` is the shape a real regression is most likely to
 * arrive in. A per-line scan counted that as zero — the guard would have passed
 * while the gate it exists to catch was being added.
 */
const GLOBAL_GATE = /isSecretary\s*\|\|\s*isAdmin|isAdmin\s*\|\|\s*isSecretary/g;

/** Occurrences of the bare global gate in a source string. */
export function countGates(source: string): number {
  return [...source.matchAll(GLOBAL_GATE)].length;
}

type Allowance = { reason: string; count: number };

const ALLOWED: Record<string, Allowance> = {
  'pages/BrowseShowsPage.tsx': {
    reason:
      'Genuinely global: a LIST of every show, deciding whether this viewer manages any show at ' +
      'all and should see management affordances in the listing. There is no single club to ' +
      'scope to at this level.',
    count: 1,
  },
  'components/notifications/MessageCenterPanel.tsx': {
    reason:
      'Messaging destinations are a global staff capability, not a per-show one — the panel is ' +
      'not rendered against a single club-owned record.',
    count: 2,
  },
  'components/shows/RegistrationWorkflow/ClassSelectionStep.tsx': {
    reason:
      'Passed as `isOrganizer` to change copy only (NoTrialsAlert wording), not to gate a ' +
      'mutation. Wrong wording for a cross-club staff viewer is cosmetic.',
    count: 2,
  },
  'pages/ShowDetailsPage.audience.ts': {
    reason:
      'UNREVIEWED (pre-existing, suspected — MYK9-464). Chooses the management vs exhibitor audience for a ' +
      'SPECIFIC show, so it should almost certainly scope on that show\u2019s club the way ' +
      'ShowDetailsPage.viewer.ts now does. Left as-is by MYK9-458, which fixed the manage gate ' +
      'but not the audience split.',
    count: 2,
  },
  'pages/ClassDetailsPage/index.tsx': {
    reason:
      'UNREVIEWED (pre-existing, suspected — MYK9-464). This file already imports canManageShowSurface for ' +
      'its lifecycle controls, then uses the bare global check for three further affordances on ' +
      'the same club-owned record. The two gates disagreeing on one page is the smell.',
    count: 3,
  },
  'pages/ClassDetailsPage/useClassDetailsData.ts': {
    reason:
      'UNREVIEWED (pre-existing, suspected — MYK9-464). Selects which entry query to run for a club-owned ' +
      'class; a cross-club staff viewer issues a secretary-scoped read the server will refuse.',
    count: 1,
  },
};

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function occurrences(): Map<string, number> {
  const found = new Map<string, number>();
  for (const file of sourceFiles(APP_SRC)) {
    // Skip the test tree itself: fixtures legitimately spell out both booleans.
    const rel = relative(APP_SRC, file).split('\\').join('/');
    if (rel.startsWith('test/')) continue;
    const hits = countGates(readFileSync(file, 'utf8'));
    if (hits > 0) found.set(rel, hits);
  }
  return found;
}

describe('scoped manage gate', () => {
  // The matcher is the guard. Test it directly, or a formatting change silently
  // disarms every assertion below.
  describe('countGates', () => {
    it('counts the single-line form', () => {
      expect(countGates('const canManage = isSecretary || isAdmin;')).toBe(1);
      expect(countGates('const canManage = isAdmin || isSecretary;')).toBe(1);
    });

    it('counts a gate Prettier wrapped across lines', () => {
      expect(countGates('const canManage =\n  isSecretary ||\n  isAdmin;')).toBe(1);
      expect(countGates('const canManage =\n  isAdmin ||\n  isSecretary;')).toBe(1);
    });

    it('counts every occurrence in a file, not just the first', () => {
      expect(countGates('a = isSecretary || isAdmin;\nb = isSecretary || isAdmin;')).toBe(2);
    });

    it('does not match a scoped call or an unrelated pair', () => {
      expect(countGates('canManageShowSurface({ isSecretary, isAdmin, clubId })')).toBe(0);
      expect(countGates('const x = isSecretary || isJudge;')).toBe(0);
    });
  });

  it('routes every club-scoped manage gate through canManageShowSurface', () => {
    const found = occurrences();
    const unlisted = [...found.keys()].filter(file => !(file in ALLOWED));

    expect(
      unlisted,
      'A global `isSecretary || isAdmin` gate was added. The server scopes manage rights to the ' +
        "record's club, so this offers controls the database will refuse (MYK9-123, MYK9-458). " +
        'Use canManageShowSurface({ ..., clubId }) from utils/roleScopes.ts, or add the file to ' +
        'ALLOWED in this test with the reason it is genuinely global.'
    ).toEqual([]);
  });

  it('fails when an allowed file grows a new occurrence', () => {
    // Counts are pinned so an allowance for one legitimate global check cannot
    // quietly cover a second, scoped one added later in the same file.
    const found = occurrences();
    const drifted = [...found.entries()]
      .filter(([file]) => file in ALLOWED)
      .filter(([file, count]) => count !== ALLOWED[file]!.count)
      .map(([file, count]) => `${file}: found ${count}, allowed ${ALLOWED[file]!.count}`);

    expect(drifted, 'Occurrence count changed in an allowlisted file').toEqual([]);
  });

  it('has no stale allowlist entries', () => {
    // A file that stopped using the pattern should leave the inventory, so the
    // list stays a description of the code rather than of its history.
    const found = occurrences();
    const stale = Object.keys(ALLOWED).filter(file => !found.has(file));

    expect(stale, 'Allowlisted file no longer contains the pattern — remove the entry').toEqual([]);
  });

  it('gives every allowance a reason', () => {
    const unexplained = Object.entries(ALLOWED)
      .filter(([, allowance]) => allowance.reason.trim().length < 40)
      .map(([file]) => file);

    expect(unexplained, 'Allowlist entries must say why the global check is correct').toEqual([]);
  });
});
