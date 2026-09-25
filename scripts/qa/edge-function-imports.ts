/**
 * Which files outside its own functions tree an edge function imports
 * (MYK9-729). `cron-health-check` imported app `src/` for its cadence
 * constants, so its deployed bundle carried a path outside
 * `supabase/functions`, and `supabase functions download` refuses to extract
 * such a file. `qa:edge-function-drift --content` could then never decide
 * whether the deploy matched source; it reported an opaque "download error".
 *
 * This walks the relative import graph from each function's `index.ts`, the
 * way the bundler does, and reports every specifier that resolves outside the
 * tree the function deploys from. Bare and URL specifiers (`npm:`, `jsr:`,
 * `https:`) are not files in the repo and are not followed. Only whole-line
 * comments are skipped, so an import named inside a string can over-report,
 * never under-report.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

export interface OutOfTreeImport {
  /** The file that holds the import, relative to the repo root. */
  importer: string;
  specifier: string;
  /** Where the specifier resolves, relative to the repo root. */
  resolved: string;
}

const IMPORT_RE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]|\bexport\s+\*\s+from\s*['"](\.{1,2}\/[^'"]+)['"]/g;

/** Relative specifiers in `text`, skipping lines that are wholly comments. */
export function relativeSpecifiers(text: string): string[] {
  const code = text
    .split('\n')
    .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
  const out: string[] = [];
  for (const m of code.matchAll(IMPORT_RE)) out.push((m[1] ?? m[2])!);
  return out;
}

function resolveFile(base: string): string | undefined {
  return [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find(
    candidate => existsSync(candidate) && statSync(candidate).isFile()
  );
}

function isInside(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir + sep);
}

/**
 * Every import reachable from `<root>/<functionsDir>/<name>/index.ts` that
 * resolves outside `<root>/<functionsDir>`.
 */
export function outOfTreeImports(
  root: string,
  functionsDir: string,
  name: string
): OutOfTreeImport[] {
  const tree = resolve(root, functionsDir);
  const entry = resolveFile(join(tree, name, 'index'));
  if (!entry) return [];
  const out: OutOfTreeImport[] = [];
  const seen = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    for (const specifier of relativeSpecifiers(readFileSync(file, 'utf8'))) {
      const target = resolve(dirname(file), specifier);
      if (!isInside(target, tree)) {
        out.push({
          importer: relative(root, file),
          specifier,
          resolved: relative(root, target),
        });
        continue;
      }
      const next = resolveFile(target);
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return out;
}

/** `outOfTreeImports` for every deployable function in each of `functionsDirs`. */
export function allOutOfTreeImports(
  root: string,
  functionsDirs: readonly string[]
): OutOfTreeImport[] {
  const out: OutOfTreeImport[] = [];
  for (const dir of functionsDirs) {
    const abs = join(root, dir);
    if (!existsSync(abs)) continue;
    for (const d of readdirSync(abs, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith('_') || d.name.startsWith('.')) continue;
      out.push(...outOfTreeImports(root, dir, d.name));
    }
  }
  return out;
}
