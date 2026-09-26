// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-774: a replicated table's getAll() answers [] when the device cannot
 * read, which a caller then reports or acts on as "there are none". Reads that
 * make a claim use getAllOrThrow() or getAllWithStatus(). This inventory is the
 * issue's grep proof: every remaining getAll() call is declared here and
 * carries a stated reason, so a new one fails this test until someone decides.
 */
const root = resolve(__dirname, '../../../../..');
const SCANNED = ['apps/myk9show/src', 'packages/replication/src'];
const REASON_MARKER = 'MYK9-774: getAll() on purpose';

/** Every file that may still call getAll(), and how many times. */
const DECLARED: Record<string, number> = {
  'apps/myk9show/src/features/show-today/accountTodayEntries.ts': 4,
  'apps/myk9show/src/hooks/useClassCompletion.tsx': 1,
  'apps/myk9show/src/services/replication/ReplicatedClassesTable.ts': 1,
  'apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts': 1,
  'apps/myk9show/src/services/replication/ReplicatedJudgeAssignmentsTable.ts': 1,
};

// A table (or this/super inside one) calling getAll(). Not IndexedDB's own
// getAll on an index, store or db handle, and not the query manager that
// implements the method.
const CALL = /\b(?:\w*[Tt]able|this|super)\.getAll\(/;
const NOT_A_TABLE = /\b(?:index|store|db|sharedDB|tx|queryManager)\.getAll\(/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === 'node_modules' || name === '__tests__' || name === 'test'
        ? []
        : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !name.endsWith('.d.ts')
      ? [path]
      : [];
  });
}

function getAllCalls() {
  const found: { file: string; line: number; reasoned: boolean }[] = [];
  for (const base of SCANNED) {
    for (const path of sourceFiles(resolve(root, base))) {
      const lines = readFileSync(path, 'utf8').split('\n');
      lines.forEach((text, index) => {
        const code = text.trim();
        if (code.startsWith('*') || code.startsWith('//')) return;
        if (!CALL.test(text) || NOT_A_TABLE.test(text)) return;
        const above = lines.slice(Math.max(0, index - 5), index).join('\n');
        found.push({
          file: relative(root, path),
          line: index + 1,
          reasoned: above.includes(REASON_MARKER),
        });
      });
    }
  }
  return found;
}

describe('replicated getAll() inventory (MYK9-774)', () => {
  const calls = getAllCalls();

  it('finds getAll() calls at all (the scan is not silently empty)', () => {
    expect(calls.length).toBeGreaterThan(0);
  });

  it('allows getAll() only where it is declared, exactly as often as declared', () => {
    const counts: Record<string, number> = {};
    for (const call of calls) counts[call.file] = (counts[call.file] ?? 0) + 1;
    expect(counts).toEqual(DECLARED);
  });

  it('gives every remaining getAll() call a stated reason just above it', () => {
    const unreasoned = calls
      .filter(call => !call.reasoned)
      .map(call => `${call.file}:${call.line}`);
    // accountTodayEntries states its reason once above the Promise.all.
    const allowedGroup = unreasoned.filter(
      loc => !loc.startsWith('apps/myk9show/src/features/show-today/accountTodayEntries.ts:')
    );
    expect(allowedGroup).toEqual([]);
  });
});
