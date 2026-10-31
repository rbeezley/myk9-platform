import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * `@myk9/ringside/run-queue` exists so the app's entry chunk can use three pure
 * helpers without pulling in dnd-kit, scoring-ui and confetti through the
 * package barrel. That only holds while this module's runtime import graph stays
 * empty of packages and of the rest of the ringside UI. Type-only imports are
 * erased and do not count.
 */
const entry = resolve(__dirname, 'runQueue.ts');
const CLOCK_TIME_ENTRY = '@myk9/core/clock-time';

function runtimeSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
  const specs: string[] = [];
  for (const node of source.statements) {
    const isImport = ts.isImportDeclaration(node);
    const isReExport = ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier;
    if (!isImport && !isReExport) continue;
    if (isImport && node.importClause?.isTypeOnly) continue;
    const spec = (node as ts.ImportDeclaration | ts.ExportDeclaration).moduleSpecifier;
    if (spec && ts.isStringLiteral(spec)) specs.push(spec.text);
  }
  return specs;
}

describe('run-queue entry stays dependency-free', () => {
  it('reads the real module (positive control)', () => {
    expect(existsSync(entry)).toBe(true);
    expect(readFileSync(entry, 'utf8')).toContain('export function pendingByRunOrder');
  });

  it('has no package imports, directly or through relative files', () => {
    const seen = new Set<string>();
    const found: string[] = [];
    const queue = [entry];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const spec of runtimeSpecifiers(file)) {
        // The clock-time parser is a dependency-free subpath of core (it has its own
        // import check below), so it does not drag the core barrel into the entry chunk.
        if (spec === CLOCK_TIME_ENTRY) continue;
        if (!spec.startsWith('.')) {
          found.push(`${file.replace(`${__dirname}/`, '')} -> ${spec}`);
          continue;
        }
        // A relative file is allowed (e.g. the pure class-time parser) so long as
        // its own runtime imports are clean: they are walked and reported here.
        const base = resolve(dirname(file), spec);
        const next = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
        if (next) queue.push(next);
        else found.push(`${file.replace(`${__dirname}/`, '')} -> ${spec} (unresolved)`);
      }
    }
    expect(found).toEqual([]);
  });

  it('allows only the dependency-free clock-time entry of core', () => {
    const coreSrc = resolve(__dirname, '../../../../core/src');
    expect(existsSync(resolve(coreSrc, 'clock-time.ts'))).toBe(true);
    expect(runtimeSpecifiers(resolve(coreSrc, 'clock-time.ts'))).toEqual([
      './utils/parseClockTime',
    ]);
    expect(runtimeSpecifiers(resolve(coreSrc, 'utils/parseClockTime.ts'))).toEqual([]);
  });
});
