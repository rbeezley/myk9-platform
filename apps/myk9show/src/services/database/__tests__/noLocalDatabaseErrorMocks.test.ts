/**
 * MYK9-181: no test may re-implement `createDatabaseError`.
 *
 * MYK9-177 replaced the global mock's hand-written copy with the real helper,
 * but 40 test files carried their own copy in a file-local `vi.mock` factory,
 * and a file-local factory beats the global one. Each disagreed with production
 * in its own way — one returned a bare `Error` (no code, table or operation),
 * four returned `code: 'UNKNOWN'`, which no production path emits, and one took
 * a message string where production passes an error object.
 *
 * The sibling parity test guards the *global* mock by comparing behavior. It
 * cannot see a file-local factory, so the only way to keep those closed is to
 * scan the source. This is the same shape as the repo's other `*.source` style
 * contract tests: cheap, and it fails on the commit that reopens the gap rather
 * than months later in an unrelated suite.
 *
 * The check is an ALLOWLIST, not a search for arrow functions. A blacklist
 * misses exactly the case Prettier produces for a long signature —
 *
 *   createDatabaseError: (
 *     error: unknown,
 *     table?: string,
 *   ) => ({ ... })
 *
 * — whose first line carries no `=>` at all. Naming the two shapes that are
 * allowed instead means anything else is an offender by default, including a
 * body that starts on the next line. `isAllowedValue` is exported and tested
 * against both shapes below, so the guard's own logic is not taken on trust.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../..');
const SELF = 'noLocalDatabaseErrorMocks.test.ts';

/**
 * The two accepted values: the real helper by name, or a spy wrapping it.
 * A test that needs to assert call arguments should not have to give up real
 * behavior to get them, so `vi.fn(realCreateDatabaseError)` stays legal.
 * (`createDatabaseError,` shorthand carries no colon and never reaches here.)
 */
export const isAllowedValue = (value: string): boolean =>
  /^\s*(vi\.fn\(\s*[A-Za-z_$][\w$]*\s*\)|[A-Za-z_$][\w$]*)\s*[,}]/.test(value);

/** Every `createDatabaseError:` value in a file, each read past the line end. */
export const declaredValues = (source: string): string[] =>
  [...source.matchAll(/createDatabaseError:/g)].map(m =>
    source.slice(m.index + m[0].length, m.index + m[0].length + 120)
  );

const testFiles = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter(p => /\.test\.tsx?$/.test(p) && !p.endsWith(SELF))
  .map(p => ({ path: p, source: readFileSync(resolve(SRC, p), 'utf8') }));

describe('the guard itself', () => {
  it('accepts the real helper and a spy wrapping it', () => {
    expect(isAllowedValue(' createDatabaseError,')).toBe(true);
    expect(isAllowedValue(' vi.fn(realCreateDatabaseError),')).toBe(true);
    expect(isAllowedValue(' createDatabaseError }')).toBe(true);
  });

  it('rejects a hand-written body, including one that starts on the next line', () => {
    expect(isAllowedValue(' (error: unknown) => error,')).toBe(false);
    expect(isAllowedValue(' vi.fn((error: unknown) => ({ message: String(error) })),')).toBe(false);
    // What Prettier emits for a signature too long for one line — the case a
    // "does the first line contain =>" check silently lets through.
    expect(isAllowedValue('\n    error: unknown,\n    table?: string,\n  ) => ({}),')).toBe(false);
    expect(isAllowedValue(' function (error) { return error; },')).toBe(false);
    // A redirect to a vi.hoisted copy — the shape MYK9-181 removed from 7 files.
    expect(isAllowedValue(' mocks.createDatabaseError,')).toBe(false);
  });
});

describe('no test re-implements createDatabaseError', () => {
  it('finds test files to scan (guards against a broken glob)', () => {
    expect(testFiles.length).toBeGreaterThan(500);
  });

  it('declares no hand-written implementation in any vi.mock factory', () => {
    const offenders = testFiles
      .filter(({ source }) => declaredValues(source).some(v => !isAllowedValue(v)))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it('keeps the global mock pointed at the real helper', () => {
    const setup = readFileSync(resolve(SRC, 'test/setup.ts'), 'utf8');
    expect(setup).toContain("from '@/services/database/databaseError'");
    expect(setup).toMatch(/^\s*createDatabaseError,$/m);
  });
});
