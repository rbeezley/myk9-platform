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
 * with a reason.
 */

const APP_SRC = resolve(import.meta.dirname, '../..');

/**
 * One operand of the gate: the identifier, optionally wrapped in parentheses or
 * a `Boolean(...)` cast. Those wrappers are how the same expression arrives
 * looking different — `(isSecretary) || isAdmin`, `Boolean(isSecretary) ||
 * isAdmin` — and an exact-adjacency match misses all of them.
 */
const operand = (name: string) => `(?:Boolean\\s*\\(\\s*)?\\(*\\s*${name}\\s*\\)*`;

/**
 * Matches the bare global gate in either operand order.
 *
 * `\s` spans newlines and the match runs over whole file CONTENTS, not
 * line-by-line: Prettier breaks a long condition after the `||`, so
 * `isSecretary ||\n  isAdmin` is the shape a real regression is most likely to
 * arrive in, and a per-line scan counted it as zero.
 *
 * **What this guard is and is not.** It catches ACCIDENTAL recurrence — someone
 * writing the natural expression without knowing the server scopes the right.
 * It is not an adversarial control: a regex over source text can always be
 * evaded by someone who wants to (assign the operands to intermediate
 * variables, and nothing here sees it). Making that airtight needs AST
 * analysis, which is not worth its weight for a two-occurrence class. The
 * allowlist is the real backstop: every entry has to carry a reason, so a gate
 * that dodges the matcher still has to survive review of the file it lives in.
 */
const GLOBAL_GATE = new RegExp(
  `${operand('isSecretary')}\\s*\\|\\|\\s*${operand('isAdmin')}` +
    `|${operand('isAdmin')}\\s*\\|\\|\\s*${operand('isSecretary')}`,
  'g'
);

/** Line and block comments, so a commented-out gate is not counted as one. */
const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

/**
 * Occurrences of the bare global gate in a source string.
 *
 * Comments are stripped first: a gate inside one is not a gate, and stripping
 * also removes the inline-comment evasion (`isSecretary /* x *\/ || isAdmin`)
 * without the matcher having to model comment syntax.
 */
export function countGates(source: string): number {
  return [...source.replace(COMMENTS, ' ').matchAll(GLOBAL_GATE)].length;
}

type Allowance = { reason: string; count: number };

const ALLOWED: Record<string, Allowance> = {
  'pages/ClassDetailsPage/index.tsx': {
    reason:
      'Intentional global viewer classification: this boolean selects the secretary run-sheet ' +
      'view versus the exhibitor results view; lifecycle controls and data queries use the ' +
      'separate club-scoped canManageShowSurface predicate.',
    count: 1,
  },
  'pages/ClassDetailsPage/useClassDetailsData.ts': {
    reason:
      'Intentional global viewer classification selects the fallback public entry query for ' +
      'secretaries/admins; the staff query remains gated by the separate club-scoped predicate.',
    count: 1,
  },
  'components/notifications/MessageCenterPanel.tsx': {
    reason:
      'Genuinely global, verified: `staffShows` is built from `currentShowIds`, so the compose ' +
      'destination list is already scoped to shows in context. These booleans decide the ' +
      'CAPABILITY (may I send show-wide / target classes), not WHICH show — there is no ' +
      'club-owned record here to scope against.',
    count: 2,
  },
  'components/shows/RegistrationWorkflow/ClassSelectionStep.tsx': {
    reason:
      'Genuinely global, verified: `isOrganizer` reaches only NoTrialsAlert and NoClassesAlert ' +
      'in ClassSelectionStep.components.tsx, where it picks between two sentences and gates no ' +
      'mutation. Worst case a cross-club staff viewer is told where to add trials instead of to ' +
      'contact the organizer.',
    count: 2,
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

    // Same expression, different clothes. Each of these read as zero before.
    it('sees through parentheses and Boolean() wrappers', () => {
      expect(countGates('const a = (isSecretary) || isAdmin;')).toBe(1);
      expect(countGates('const b = Boolean(isSecretary) || isAdmin;')).toBe(1);
      expect(countGates('const c = Boolean(isAdmin) || Boolean(isSecretary);')).toBe(1);
      expect(countGates('const d = (isAdmin) || (isSecretary);')).toBe(1);
    });

    it('ignores a gate that is only a comment, and an inline comment inside one', () => {
      expect(countGates('// const legacy = isSecretary || isAdmin;')).toBe(0);
      expect(countGates('/* isSecretary || isAdmin */')).toBe(0);
      expect(countGates('const e = isSecretary /* staff */ || isAdmin;')).toBe(1);
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
