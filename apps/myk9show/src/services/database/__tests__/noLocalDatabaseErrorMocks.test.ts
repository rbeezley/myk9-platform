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
 * Wrapping the real helper in a spy (`vi.fn(realCreateDatabaseError)`) is fine
 * and stays allowed — a test that needs to assert call arguments should not
 * have to give up real behavior to get them. Only a hand-written body is banned.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../..');
const SELF = 'noLocalDatabaseErrorMocks.test.ts';

const testFiles = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter(p => /\.test\.tsx?$/.test(p) && !p.endsWith(SELF))
  .map(p => ({ path: p, source: readFileSync(resolve(SRC, p), 'utf8') }));

/** The property value, up to the end of its first line — enough to spot a body. */
const declarations = (source: string) =>
  [...source.matchAll(/createDatabaseError:\s*(.*)/g)].map(m => m[1]);

describe('no test re-implements createDatabaseError', () => {
  it('finds test files to scan (guards against a broken glob)', () => {
    expect(testFiles.length).toBeGreaterThan(500);
  });

  it('declares no hand-written implementation in any vi.mock factory', () => {
    const offenders = testFiles
      .filter(({ source }) =>
        declarations(source).some(value => value.includes('=>') || value.includes('function'))
      )
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it('keeps the global mock pointed at the real helper', () => {
    const setup = readFileSync(resolve(SRC, 'test/setup.ts'), 'utf8');
    expect(setup).toContain("from '@/services/database/databaseError'");
    expect(setup).toMatch(/^\s*createDatabaseError,$/m);
  });
});
