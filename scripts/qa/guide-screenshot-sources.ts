/**
 * MYK9-2411: the source files that draw one guide screenshot's screen.
 *
 * The screen map names only each screen's ENTRY (its page or panel). Everything that entry
 * renders is found here by following its imports, so a component the page pulls in is tracked
 * without anyone listing it. A hand-kept list of components was tried first and missed the
 * panel, card and row components a page delegates to (Codex review of #4477).
 *
 * What counts as the screen's own source:
 *  - files under the app's `pages/`, `components/` and `features/`, reached by import;
 *  - for an entry inside a workspace package, files of that same package reached by a
 *    relative import.
 * Imports are followed through every such file, but only markup and styles (`.tsx`, `.css`) are
 * listed: a `.ts` helper beside a component is logic, and a change to it is not a new picture.
 * An entry is always listed, whatever it is.
 *
 * What does not count, and is neither listed nor followed:
 *  - shared building blocks (`SHARED_VIEW_DIRS`): a change to the shared Button is not a
 *    reason to recapture forty screens;
 *  - logic with no markup of its own (`hooks/`, `lib/`, `services/`, `store/`, `utils/`, ...);
 *  - other workspace packages (`@myk9/*`) and node modules;
 *  - tests.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

const APP_SRC = 'apps/myk9show/src';

/** The app directories whose files are view code. */
const VIEW_ROOTS = ['pages', 'components', 'features'].map(dir => `${APP_SRC}/${dir}/`);

/** View code every screen shares. A change here is not a change to one screen. */
export const SHARED_VIEW_DIRS = [
  'components/ui',
  'components/common',
  'components/layout',
  'components/layouts',
  'components/navigation',
  'components/icons',
  'components/base',
  'components/shared',
  'components/forms',
  'components/list-toolkit',
  'features/_shared',
].map(dir => `${APP_SRC}/${dir}/`);

const SOURCE_FILE = /\.(tsx?|css)$/;
/** What the report lists: files that hold markup or styles. */
const LISTED_FILE = /\.(tsx|css)$/;
const TEST_FILE = /(\.(test|spec)\.[^/]+$)|(\/__tests__\/)/;
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1/g;

const isTest = (path: string): boolean => TEST_FILE.test(path);

/** Whether `path` (repo-relative) is a screen's own source when reached from `entry`. */
function isScreenSource(path: string, entryPackage: string | null): boolean {
  if (isTest(path) || !SOURCE_FILE.test(path)) return false;
  if (entryPackage) return path.startsWith(`${entryPackage}/`);
  if (SHARED_VIEW_DIRS.some(dir => path.startsWith(dir))) return false;
  return VIEW_ROOTS.some(dir => path.startsWith(dir));
}

/** `packages/<name>` when `path` is inside a workspace package, else null. */
function packageOf(path: string): string | null {
  return /^(packages\/[^/]+)\//.exec(path)?.[1] ?? null;
}

function resolveFile(root: string, candidate: string): string | null {
  const tries = [
    candidate,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    `${candidate}/index.ts`,
    `${candidate}/index.tsx`,
  ];
  for (const path of tries) {
    const full = join(root, path);
    if (existsSync(full) && statSync(full).isFile()) return path;
  }
  return null;
}

/** The repo-relative file an import names, or null for a package, a node module or a miss. */
function resolveImport(root: string, fromFile: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) return resolveFile(root, `${APP_SRC}/${specifier.slice(2)}`);
  if (specifier.startsWith('.')) {
    return resolveFile(root, posix.normalize(posix.join(posix.dirname(fromFile), specifier)));
  }
  return null;
}

function importsOf(root: string, file: string): string[] {
  if (!/\.tsx?$/.test(file)) return [];
  const text = readFileSync(join(root, file), 'utf8');
  return [...text.matchAll(IMPORT_SPECIFIER)].map(match => match[2] ?? '');
}

/** Every source file under a directory entry, tests left out. */
function filesUnder(root: string, dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    const path = `${dir}/${name}`;
    if (statSync(join(root, path)).isDirectory()) found.push(...filesUnder(root, path));
    else if (SOURCE_FILE.test(path) && !isTest(path)) found.push(path);
  }
  return found;
}

/**
 * The files that draw a screen: its entries and what they import, as the header describes.
 * An entry may be a file or a directory (every source file in it is then an entry).
 * Sorted, repo-relative, forward slashes.
 */
export function screenSources(root: string, entries: string[]): string[] {
  const seen = new Set<string>();
  const queue: Array<{ file: string; entryPackage: string | null }> = [];
  const add = (file: string, entryPackage: string | null): void => {
    if (seen.has(file)) return;
    seen.add(file);
    queue.push({ file, entryPackage });
  };

  for (const entry of entries) {
    const full = join(root, entry);
    if (!existsSync(full)) continue;
    const files = statSync(full).isDirectory() ? filesUnder(root, entry) : [entry];
    // An entry is always the screen's source, wherever it lives.
    for (const file of files) add(file, packageOf(file));
  }
  const queue0 = queue.map(item => item.file);

  for (let next = queue.shift(); next; next = queue.shift()) {
    for (const specifier of importsOf(root, next.file)) {
      const target = resolveImport(root, next.file, specifier);
      if (target && isScreenSource(target, next.entryPackage)) add(target, next.entryPackage);
    }
  }
  const entryFiles = new Set(queue0);
  return [...seen].filter(file => entryFiles.has(file) || LISTED_FILE.test(file)).sort();
}
