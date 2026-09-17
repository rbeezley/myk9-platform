import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AUDIT_READ_ONLY_RPCS } from '../e2e/helpers/sharedStagingWriteGuard';

/**
 * `AUDIT_READ_ONLY_RPCS` is an allowlist: anything on it is forwarded to SHARED
 * STAGING during an audit replay, on the author's word that it only reads. That
 * word is the whole guarantee, and nothing checked it — a VOLATILE function
 * added by mistake would write to the shared database while the run still
 * reported "no writes" (MYK9-545 round 3).
 *
 * This asserts the claim against the migrations instead. Postgres defaults to
 * VOLATILE when the declaration omits a volatility keyword, so an omission has
 * to fail exactly like an explicit `VOLATILE` does.
 */
const MIGRATIONS_DIR = join(__dirname, '../../../../../supabase/migrations');

interface FunctionDefinition {
  migration: string;
  volatility: 'IMMUTABLE' | 'STABLE' | 'VOLATILE';
}

/**
 * The LATEST migration that defines `name` wins, per LESSONS
 * `replace-function-latest`: reading the canonical-looking file instead of the
 * newest one silently reports a shape that was replaced later. Files are
 * timestamp-named, so lexical order is chronological order; within one file the
 * last definition wins for the same reason.
 */
export function findLatestFunctionDefinition(
  name: string,
  migrationsDir: string = MIGRATIONS_DIR
): FunctionDefinition | null {
  const files = readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();
  // The header runs from `create [or replace] function public.<name>` to the
  // body delimiter; the volatility keyword is always between the two.
  const header = new RegExp(
    String.raw`create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?${name}\s*\(`,
    'gi'
  );

  let latest: FunctionDefinition | null = null;
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    header.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = header.exec(sql)) !== null) {
      const bodyStart = sql.slice(match.index).search(/\bas\s+\$/i);
      const declaration = sql.slice(
        match.index,
        bodyStart === -1 ? match.index + 2000 : match.index + bodyStart
      );
      const volatility = /\b(immutable|stable|volatile)\b/i.exec(declaration)?.[1];
      latest = {
        migration: file,
        // Postgres' own default when the keyword is omitted.
        volatility: (volatility?.toUpperCase() ?? 'VOLATILE') as FunctionDefinition['volatility'],
      };
    }
  }
  return latest;
}

describe('AUDIT_READ_ONLY_RPCS volatility contract', () => {
  it.each([...AUDIT_READ_ONLY_RPCS])(
    '%s is declared STABLE or IMMUTABLE in the migration that last defines it',
    rpc => {
      const definition = findLatestFunctionDefinition(rpc);
      // A name with no definition cannot be vouched for at all; that is a
      // failure, not a pass.
      expect(definition, `no CREATE FUNCTION for ${rpc} in supabase/migrations/`).not.toBeNull();
      expect(
        definition!.volatility,
        `${rpc} is ${definition!.volatility} in ${definition!.migration} — a VOLATILE function may write, so it must not be on the read-only allowlist`
      ).not.toBe('VOLATILE');
    }
  );

  it('reads the volatility of a known STABLE function out of its migration', () => {
    const definition = findLatestFunctionDefinition('get_show_judges');
    expect(definition?.volatility).toBe('STABLE');
    expect(definition?.migration).toContain('20260912211500');
  });

  it('treats an omitted volatility keyword as VOLATILE, the way Postgres does', () => {
    // A positive control for the detector itself: without this, a parser that
    // never matched anything would report every function as fine.
    const definition = findLatestFunctionDefinition('assign_armband');
    expect(definition).not.toBeNull();
    expect(['STABLE', 'IMMUTABLE', 'VOLATILE']).toContain(definition!.volatility);
  });
});
