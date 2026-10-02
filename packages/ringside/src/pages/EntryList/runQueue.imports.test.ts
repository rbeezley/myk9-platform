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

  it('has no runtime imports, directly or through relative files', () => {
    const seen = new Set<string>();
    const found: string[] = [];
    const queue = [entry];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const spec of runtimeSpecifiers(file)) {
        found.push(`${file.replace(`${__dirname}/`, '')} -> ${spec}`);
        if (spec.startsWith('.')) {
          const base = resolve(dirname(file), spec);
          const next = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
          if (next) queue.push(next);
        }
      }
    }
    expect(found).toEqual([]);
  });
});
