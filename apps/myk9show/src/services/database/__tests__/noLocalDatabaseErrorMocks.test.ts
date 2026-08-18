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
 * — whose first line carries no `=>` at all. Naming the shapes that are allowed
 * instead means anything else is an offender by default, including a body that
 * starts on the next line.
 *
 * An allowlist of *shapes* is still not enough: `createDatabaseError: fakeError`
 * is a bare identifier, and so is the real thing. So the identifier must also be
 * one this file imports from `databaseError` — a name is only trusted when its
 * binding is. `helperBindings` and `isAllowedValue` are exported and tested
 * against accepted and rejected inputs, so the guard's own logic is not taken on
 * trust; a guard that cannot fail is a comment with a test runner attached.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../..');
const SELF = 'noLocalDatabaseErrorMocks.test.ts';

/** Identifiers a file binds to the real helper by importing it. */
export const helperBindings = (source: string): Set<string> => {
  const names = new Set<string>();
  const imports = /import\s*\{([^}]*)\}\s*from\s*['"][^'"]*databaseError['"]/g;
  for (const match of source.matchAll(imports)) {
    for (const specifier of match[1].split(',')) {
      const [imported, alias] = specifier.split(/\s+as\s+/).map(part => part.trim());
      if (imported === 'createDatabaseError') names.add(alias || imported);
    }
  }
  return names;
};

/**
 * The accepted values: the real helper by name, or a spy wrapping it. A test
 * that needs to assert call arguments should not have to give up real behavior
 * to get them, so `vi.fn(realCreateDatabaseError)` stays legal — but only when
 * that identifier is imported from `databaseError`, since a stand-in named
 * `fakeError` is otherwise indistinguishable from the genuine article.
 * (`createDatabaseError,` shorthand carries no colon and never reaches here;
 * `declaresOwnHelper` covers a locally declared binding of that name.)
 */
export const isAllowedValue = (value: string, bindings: Set<string>): boolean => {
  const match = /^\s*(?:vi\.fn\(\s*([A-Za-z_$][\w$]*)\s*\)|([A-Za-z_$][\w$]*))\s*[,}]/.exec(value);
  const identifier = match?.[1] ?? match?.[2];
  return identifier !== undefined && bindings.has(identifier);
};

/** A local `const/let/function createDatabaseError`, which shorthand would hide. */
export const declaresOwnHelper = (source: string): boolean =>
  /(?:const|let|var|function)\s+createDatabaseError\b/.test(source);

/** Every `createDatabaseError:` value in a file, each read past the line end. */
export const declaredValues = (source: string): string[] =>
  [...source.matchAll(/createDatabaseError:/g)].map(m =>
    source.slice(m.index + m[0].length, m.index + m[0].length + 120)
  );

const testFiles = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter(p => /\.test\.tsx?$/.test(p) && !p.endsWith(SELF))
  .map(p => ({ path: p, source: readFileSync(resolve(SRC, p), 'utf8') }));

const REAL = new Set(['createDatabaseError', 'realCreateDatabaseError']);

describe('the guard itself', () => {
  it('reads the identifiers a file binds to the real helper', () => {
    expect(
      helperBindings("import { createDatabaseError } from '@/services/database/databaseError';")
    ).toEqual(new Set(['createDatabaseError']));
    expect(
      helperBindings(
        "import { createDatabaseError as realCreateDatabaseError } from '../databaseError';"
      )
    ).toEqual(new Set(['realCreateDatabaseError']));
    // Same name, different module — not a binding to the helper.
    expect(helperBindings("import { createDatabaseError } from './localFake';")).toEqual(new Set());
  });

  it('accepts the real helper and a spy wrapping it', () => {
    expect(isAllowedValue(' createDatabaseError,', REAL)).toBe(true);
    expect(isAllowedValue(' vi.fn(realCreateDatabaseError),', REAL)).toBe(true);
    expect(isAllowedValue(' createDatabaseError }', REAL)).toBe(true);
  });

  it('rejects a hand-written body, including one that starts on the next line', () => {
    expect(isAllowedValue(' (error: unknown) => error,', REAL)).toBe(false);
    expect(isAllowedValue(' vi.fn((error: unknown) => ({ message: String(error) })),', REAL)).toBe(
      false
    );
    // What Prettier emits for a signature too long for one line — the case a
    // "does the first line contain =>" check silently lets through.
    expect(isAllowedValue('\n    error: unknown,\n    table?: string,\n  ) => ({}),', REAL)).toBe(
      false
    );
    expect(isAllowedValue(' function (error) { return error; },', REAL)).toBe(false);
    // A redirect to a vi.hoisted copy — the shape MYK9-181 removed from 7 files.
    expect(isAllowedValue(' mocks.createDatabaseError,', REAL)).toBe(false);
  });

  it('rejects an identifier that is not bound to the real helper', () => {
    // The shape is right and the name reads plausibly, but nothing imported it —
    // a stand-in assigned to a local const would otherwise sail through.
    expect(isAllowedValue(' fakeError,', REAL)).toBe(false);
    expect(isAllowedValue(' vi.fn(fakeError),', REAL)).toBe(false);
    expect(isAllowedValue(' createDatabaseError,', new Set())).toBe(false);
  });

  it('rejects a locally declared helper, which shorthand would otherwise hide', () => {
    expect(declaresOwnHelper('const createDatabaseError = (e: unknown) => e;')).toBe(true);
    expect(declaresOwnHelper('function createDatabaseError() {}')).toBe(true);
    expect(
      declaresOwnHelper("import { createDatabaseError } from '@/services/database/databaseError';")
    ).toBe(false);
  });
});

describe('no test re-implements createDatabaseError', () => {
  it('finds test files to scan (guards against a broken glob)', () => {
    expect(testFiles.length).toBeGreaterThan(500);
  });

  it('declares no hand-written implementation in any vi.mock factory', () => {
    const offenders = testFiles
      .filter(({ source }) => {
        const bindings = helperBindings(source);
        return (
          declaresOwnHelper(source) ||
          declaredValues(source).some(value => !isAllowedValue(value, bindings))
        );
      })
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it('keeps the global mock pointed at the real helper', () => {
    const setup = readFileSync(resolve(SRC, 'test/setup.ts'), 'utf8');
    expect(setup).toContain("from '@/services/database/databaseError'");
    expect(setup).toMatch(/^\s*createDatabaseError,$/m);
  });
});
