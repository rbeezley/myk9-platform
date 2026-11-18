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
 *
 * MYK9-2140: src/main.tsx is now the light start a first-time landing visitor downloads, and
 * the app (the signed-in shell and every route) is src/router.tsx, loaded as its own file. The
 * MYK9-844 checks follow the app; the last test keeps the app out of the light start.
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
  const entry = walk(resolve(srcRoot, 'router.tsx'));
  const lightStart = walk(resolve(srcRoot, 'main.tsx'));

  it('walks the real graph (positive control)', () => {
    expect(entry.files.size).toBeGreaterThan(500);
    expect(entry.externals.has('react')).toBe(true);
    // A deep file the header pulls in statically. (It was premiumPublishCoordinator.ts until
    // MYK9-1298 removed the Actions premium row, which took that out of the entry chunk.)
    expect(entry.files.has(resolve(srcRoot, 'features/actions/actionRegistry.ts'))).toBe(true);
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

  it('keeps the app out of the light start a landing visitor downloads', () => {
    // Positive control: the walk reached the landing page through the guest root.
    expect(lightStart.files.has(resolve(srcRoot, 'pages/Home.tsx'))).toBe(true);
    expect(lightStart.files.has(resolve(srcRoot, 'boot/GuestLanding.tsx'))).toBe(true);

    const forbiddenFiles = [
      'router.tsx',
      'App.tsx',
      'context/AuthContext.tsx',
      'providers/ReplicationSyncProvider.tsx',
      'components/layout/AppHeader.tsx',
      'services/replication/index.ts',
    ].map(file => resolve(srcRoot, file));
    expect(
      forbiddenFiles
        .filter(file => lightStart.files.has(file))
        .map(file => chain(lightStart, file)),
      'static import of the app from the light start'
    ).toEqual([]);

    const forbiddenPackages = ['@myk9/replication', 'dexie', 'zod'];
    expect(
      forbiddenPackages
        .filter(spec => lightStart.externals.has(spec))
        .map(spec => chain(lightStart, spec)),
      'static import of an app-only package from the light start'
    ).toEqual([]);
  });

  it('keeps the dog detail page a lazy route', () => {
    const page = resolve(srcRoot, 'pages/DogDetailPage.tsx');
    expect(entry.files.has(page) ? chain(entry, page) : null).toBeNull();
  });
});
