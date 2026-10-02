// @vitest-environment node
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-844: the entry chunk fell from 3.56 MB to 1.86 MB when PDF publishing,
 * the ringside UI and the dog page left it. Nothing in typecheck or the unit
 * suite notices a static import creeping back, so this walks the import graph
 * Vite follows from src/main.tsx. Dynamic `import()` is a chunk boundary and is
 * not followed; type-only imports are erased and are not followed either.
 */
const srcRoot = resolve(__dirname, '../..');

type Graph = { files: Set<string>; externals: Set<string>; via: Map<string, string> };

function resolveLocal(spec: string, from: string): string | null {
  const base = spec.startsWith('@/')
    ? resolve(srcRoot, spec.slice(2))
    : resolve(dirname(from), spec);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    resolve(base, 'index.ts'),
    resolve(base, 'index.tsx'),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function staticSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    false,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const specs: string[] = [];
  for (const node of source.statements) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (clause?.isTypeOnly) continue;
      // `import { type A, type B } from 'x'` is erased entirely.
      const named = clause?.namedBindings;
      if (
        clause &&
        !clause.name &&
        named &&
        ts.isNamedImports(named) &&
        named.elements.length > 0 &&
        named.elements.every(element => element.isTypeOnly)
      ) {
        continue;
      }
      specs.push(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !node.isTypeOnly
    ) {
      specs.push(node.moduleSpecifier.text);
    }
  }
  return specs;
}

function walk(entry: string): Graph {
  const graph: Graph = { files: new Set(), externals: new Set(), via: new Map() };
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (graph.files.has(file)) continue;
    graph.files.add(file);
    for (const spec of staticSpecifiers(file)) {
      if (spec.startsWith('.') || spec.startsWith('@/')) {
        const local = resolveLocal(spec, file);
        if (local && !graph.files.has(local)) {
          if (!graph.via.has(local)) graph.via.set(local, file);
          queue.push(local);
        }
      } else if (!graph.externals.has(spec)) {
        graph.externals.add(spec);
        graph.via.set(spec, file);
      }
    }
  }
  return graph;
}

function chain(graph: Graph, target: string): string {
  const path: string[] = [];
  for (let at: string | undefined = target; at; at = graph.via.get(at)) {
    path.unshift(at.replace(`${srcRoot}/`, 'src/'));
  }
  return path.join('\n  -> ');
}

describe('entry chunk split', () => {
  const entry = walk(resolve(srcRoot, 'main.tsx'));

  it('walks the real graph (positive control)', () => {
    expect(entry.files.size).toBeGreaterThan(500);
    expect(entry.externals.has('react')).toBe(true);
    expect(entry.files.has(resolve(srcRoot, 'features/premium/premiumPublishCoordinator.ts'))).toBe(
      true
    );
  });

  it('keeps the PDF publish path out of the entry closure', () => {
    const forbiddenFiles = [
      'features/experience/publishExperience.tsx',
      'features/premium/publishPremium.tsx',
    ].map(file => resolve(srcRoot, file));
    const leaked = forbiddenFiles.filter(file => entry.files.has(file));
    expect(
      leaked.map(file => chain(entry, file)),
      'static import of the PDF publisher'
    ).toEqual([]);
    const pdfPackages = [...entry.externals].filter(spec => spec.startsWith('@react-pdf/'));
    expect(
      pdfPackages.map(spec => chain(entry, spec)),
      'static import of @react-pdf'
    ).toEqual([]);
  });

  it('keeps the ringside UI barrel out of the entry closure', () => {
    // Run-queue helpers come from the dependency-free subpath instead.
    expect(entry.externals.has('@myk9/ringside/run-queue')).toBe(true);
    expect(
      entry.externals.has('@myk9/ringside') ? chain(entry, '@myk9/ringside') : null,
      'static import of the @myk9/ringside barrel'
    ).toBeNull();
  });

  it('keeps the dog detail page a lazy route', () => {
    const page = resolve(srcRoot, 'pages/DogDetailPage.tsx');
    expect(entry.files.has(page) ? chain(entry, page) : null).toBeNull();
  });
});
