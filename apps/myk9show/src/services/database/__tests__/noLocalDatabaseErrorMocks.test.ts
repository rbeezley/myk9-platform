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
 * scan the source.
 *
 * This uses the TypeScript parser rather than regexes, after four review rounds
 * found four ways past four successive patterns: a body split across lines
 * (Prettier does this to long signatures), an arbitrary identifier, a module
 * merely *named* `…databaseError`, and shorthand written inline instead of on
 * its own line. Each fix was a narrower pattern, and each time the next shape
 * walked past it. Text patterns approximate syntax; the parser is syntax, so
 * `{ createDatabaseError }`, `{ createDatabaseError: x }` and a body wrapped
 * over ten lines are all the same question to it.
 *
 * The rule: every `createDatabaseError` property in a `vi.mock` factory must be
 * the real helper by name, or `vi.fn()` wrapping it — and that name must be
 * imported from the helper module, compared by RESOLVED PATH, since naming a
 * local file `localDatabaseError` is not evidence of anything. A spy wrapper
 * stays legal: a test asserting call arguments should not have to give up real
 * behavior to get them.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../..');
const SELF = 'noLocalDatabaseErrorMocks.test.ts';
/** The one module a `createDatabaseError` binding may come from. */
const HELPER_MODULE = resolve(SRC, 'services/database/databaseError');

const parse = (source: string) =>
  ts.createSourceFile('f.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

/** Where a specifier points, or null for a bare package import. */
const resolveSpecifier = (specifier: string, fromFile: string): string | null => {
  if (specifier.startsWith('@/')) return resolve(SRC, specifier.slice(2));
  if (specifier.startsWith('.')) return resolve(dirname(fromFile), specifier);
  return null;
};

/**
 * Identifiers a file binds to the real helper by importing it. Compared by
 * resolved path: `./localDatabaseError` merely *looks* like the helper, and a
 * guard that trusts appearances is one rename from useless.
 */
export const helperBindings = (source: string, fromFile: string): Set<string> => {
  const names = new Set<string>();
  for (const statement of parse(source).statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (resolveSpecifier(statement.moduleSpecifier.text, fromFile) !== HELPER_MODULE) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text;
      if (imported === 'createDatabaseError') names.add(element.name.text);
    }
  }
  return names;
};

/**
 * Every `createDatabaseError` property that is not the real helper. Covers
 * `{ createDatabaseError }`, `{ createDatabaseError: x }` and any body, in one
 * pass, because the parser has already normalised how they were written.
 */
export const offendingProperties = (source: string, fromFile: string): string[] => {
  const allowed = helperBindings(source, fromFile);
  const offenders: string[] = [];

  const isRealHelper = (value: ts.Expression): boolean => {
    if (ts.isIdentifier(value)) return allowed.has(value.text);
    // `vi.fn(realCreateDatabaseError)` — a spy around the genuine article.
    if (
      ts.isCallExpression(value) &&
      value.expression.getText() === 'vi.fn' &&
      value.arguments.length === 1
    ) {
      const [argument] = value.arguments;
      return ts.isIdentifier(argument) && allowed.has(argument.text);
    }
    return false;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && node.name.getText() === 'createDatabaseError') {
      if (!isRealHelper(node.initializer)) offenders.push(node.getText().slice(0, 60));
    }
    // `{ createDatabaseError }` — the binding itself is the value.
    if (
      ts.isShorthandPropertyAssignment(node) &&
      node.name.text === 'createDatabaseError' &&
      !allowed.has('createDatabaseError')
    ) {
      offenders.push('shorthand createDatabaseError (not the imported helper)');
    }
    ts.forEachChild(node, visit);
  };

  visit(parse(source));
  return offenders;
};

const testFiles = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter(p => /\.test\.tsx?$/.test(p) && !p.endsWith(SELF))
  .map(p => ({ path: p, source: readFileSync(resolve(SRC, p), 'utf8') }));

describe('the guard itself', () => {
  // A file where the swept tests sit, so relative specifiers resolve.
  const FROM = resolve(SRC, 'services/database/entries/example.test.ts');
  const REAL = "import { createDatabaseError } from '@/services/database/databaseError';\n";
  const ALIASED = "import { createDatabaseError as real } from '../databaseError';\n";
  const check = (source: string) => offendingProperties(source, FROM);

  it('reads the identifiers a file binds to the real helper', () => {
    expect(helperBindings(REAL, FROM)).toEqual(new Set(['createDatabaseError']));
    expect(helperBindings(ALIASED, FROM)).toEqual(new Set(['real']));
  });

  it('accepts the real helper, by value, by shorthand, and wrapped in a spy', () => {
    expect(check(`${REAL}vi.mock('m', () => ({ createDatabaseError }));`)).toEqual([]);
    expect(
      check(`${REAL}vi.mock('m', () => ({ createDatabaseError: createDatabaseError }));`)
    ).toEqual([]);
    expect(check(`${ALIASED}vi.mock('m', () => ({ createDatabaseError: vi.fn(real) }));`)).toEqual(
      []
    );
  });

  it('rejects a hand-written body however it is formatted', () => {
    expect(check(`vi.mock('m', () => ({ createDatabaseError: (e: unknown) => e }));`)).toHaveLength(
      1
    );
    // What Prettier emits for a signature too long for one line — the shape a
    // "does the first line contain =>" check silently let through.
    expect(
      check(`vi.mock('m', () => ({
        createDatabaseError: (
          error: unknown,
          table?: string
        ) => ({ message: String(error), code: 'UNKNOWN' }),
      }));`)
    ).toHaveLength(1);
    expect(check(`vi.mock('m', () => ({ createDatabaseError: vi.fn((e) => e) }));`)).toHaveLength(
      1
    );
    // A redirect to a vi.hoisted copy — the shape removed from 7 files here.
    expect(
      check(`vi.mock('m', () => ({ createDatabaseError: mocks.createDatabaseError }));`)
    ).toHaveLength(1);
  });

  it('rejects an identifier that is not bound to the real helper', () => {
    expect(check(`vi.mock('m', () => ({ createDatabaseError: fakeError }));`)).toHaveLength(1);
    expect(check(`vi.mock('m', () => ({ createDatabaseError: vi.fn(fakeError) }));`)).toHaveLength(
      1
    );
    expect(
      check(
        `const createDatabaseError = (e: unknown) => e;\nvi.mock('m', () => ({ createDatabaseError }));`
      )
    ).toHaveLength(1);
  });

  it('rejects a look-alike module, with shorthand or with a value', () => {
    const fake = "import { createDatabaseError } from './localDatabaseError';\n";
    expect(check(`${fake}vi.mock('m', () => ({ createDatabaseError }));`)).toHaveLength(1);
    expect(
      check(`${fake}vi.mock('m', () => ({ createDatabaseError: createDatabaseError }));`)
    ).toHaveLength(1);
    const mockDir = "import { createDatabaseError } from '@/test/mocks/databaseError';\n";
    expect(check(`${mockDir}vi.mock('m', () => ({ createDatabaseError }));`)).toHaveLength(1);
  });

  it('sees shorthand written inline, not only on its own line', () => {
    // No trailing comma, no newline — the shape the line-anchored check missed.
    expect(check(`vi.mock('m', () => ({ supabase, createDatabaseError }));`)).toHaveLength(1);
  });
});

describe('no test re-implements createDatabaseError', () => {
  it('finds test files to scan (guards against a broken glob)', () => {
    expect(testFiles.length).toBeGreaterThan(500);
  });

  it('declares no hand-written implementation in any vi.mock factory', () => {
    const offenders = testFiles
      .filter(({ path, source }) => offendingProperties(source, resolve(SRC, path)).length > 0)
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it('keeps the global mock pointed at the real helper', () => {
    const setup = readFileSync(resolve(SRC, 'test/setup.ts'), 'utf8');
    expect(setup).toContain("from '@/services/database/databaseError'");
    expect(setup).toMatch(/^\s*createDatabaseError,$/m);
  });
});
