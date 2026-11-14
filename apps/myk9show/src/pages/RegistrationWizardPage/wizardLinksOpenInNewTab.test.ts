import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { relativePosix } from '@/test/utils/posixPath';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-1973: leaving the entry wizard in the same tab drops the selected dogs
 * and the current step, so every link rendered by the wizard opens in a new
 * tab. This walks the wizard's static import graph (from `pages/RegistrationWizardPage.tsx`) for
 * link elements, so a new same-tab
 * link fails here. Imperative `navigate()` calls are the wizard's own exits
 * (Cancel, Back, post-submit) and are not links.
 */
const SRC = join(__dirname, '..', '..');
const ENTRY = join(SRC, 'pages/RegistrationWizardPage.tsx');

/**
 * Files whose links intentionally stay in the tab (every link in the file), each with
 * the reason. The static graph is coarser than the render tree: a file can be reachable
 * through a barrel export without the wizard ever drawing it. Keyed by path under src.
 */
const SAME_TAB_ALLOWLIST: Record<string, string> = {
  'components/common/EmptyState.tsx':
    'Reached only through the ClassesTab -> list-toolkit barrel chain; the wizard never renders an empty state.',
  'features/delete/DeleteObjectDialogView.tsx':
    'Reached only through the panels/edit barrel; the delete dialog exists on edit panels, never in the wizard, and its blocked-action link is the recovery path that must navigate.',
  'components/ui/DelightfulError.tsx':
    'Full-page error fallback ("Go home"): the wizard has already failed, so leaving it is the point.',
};

const IMPORT_RE = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = join(dirname(from), spec);
  else return null; // node_modules and workspace packages
  const candidates = [
    `${base}.tsx`,
    `${base}.ts`,
    join(base, 'index.tsx'),
    join(base, 'index.ts'),
    base,
  ];
  return (
    candidates.find(
      c => /\.tsx?$/.test(c) && existsSync(c) && statSync(c).isFile() && !isTestFile(c)
    ) ?? null
  );
}

function isTestFile(file: string): boolean {
  return (
    /\.(test|spec)\.tsx?$/.test(file) || /(^|\/)(__tests__|test)\//.test(relativePosix(SRC, file))
  );
}

/** Every source file statically reachable from `entry` through relative and `@/` imports. */
function wizardImportGraph(entry: string): string[] {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT_RE)) {
      const target = resolveImport(file, match[1] as string);
      if (target && !seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return [...seen].filter(f => f.endsWith('.tsx')).sort();
}

/**
 * Every `<Link`, `<NavLink` and `<a` opening tag, read to its closing `>`: braces
 * balanced, and a `>` inside a quoted string (or template literal) is not the end.
 */
function linkOpeningTags(source: string): string[] {
  const tags: string[] = [];
  for (const match of source.matchAll(/<(Link|NavLink|a)(?=[\s>])/g)) {
    let depth = 0;
    let quote: string | null = null;
    let i = match.index;
    for (; i < source.length; i += 1) {
      const ch = source[i] as string;
      if (quote) {
        if (ch === '\\') i += 1;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0 && source[i - 1] !== '=') break;
    }
    tags.push(source.slice(match.index, i + 1));
  }
  return tags;
}

const GRAPH = wizardImportGraph(ENTRY);

describe('links out of the entry wizard', () => {
  const found = GRAPH.flatMap(file =>
    linkOpeningTags(readFileSync(file, 'utf8')).map(tag => ({
      file: relativePosix(SRC, file),
      where: `${relativePosix(SRC, file)}: ${tag.replace(/\s+/g, ' ').slice(0, 80)}`,
      tag,
    }))
  );

  it('finds the wizard link set (guards the walker itself)', () => {
    const files = GRAPH.map(f => relativePosix(SRC, f));
    expect(files).toContain('components/shows/RegistrationWorkflow/OwnerAddressFix.tsx');
    expect(files).toContain('components/panels/edit/BasicInfoTab.tsx');
    expect(files).toContain('features/payments/PlatformFeeSplitLines.tsx');
    expect(found.length).toBeGreaterThanOrEqual(9);
  });

  it('reads a tag whose attribute value holds a ">"', () => {
    const tags = linkOpeningTags('<Link to="/a" title="x > y" target="_blank">go</Link>');
    expect(tags).toEqual(['<Link to="/a" title="x > y" target="_blank">']);
  });

  it('keeps every allowlisted file in the graph, each with a reason', () => {
    for (const [file, reason] of Object.entries(SAME_TAB_ALLOWLIST)) {
      expect(
        GRAPH.map(f => relativePosix(SRC, f)),
        file
      ).toContain(file);
      expect(reason.length, file).toBeGreaterThan(20);
    }
  });

  it.each(found.map(f => [f.where, f.tag, f.file] as const))(
    'opens in a new tab: %s',
    (_where, tag, file) => {
      if (SAME_TAB_ALLOWLIST[file]) return;
      expect(tag).toMatch(/target(=|:\s*)["']_blank["']/);
      expect(tag).toMatch(/noopener noreferrer/);
    }
  );

  // NoRegistrationNumberHelp only opens a new tab when told to, via a
  // conditional spread the tag walker cannot see.
  it('passes opensInNewTab wherever the wizard renders NoRegistrationNumberHelp', () => {
    const wizardFiles = GRAPH.filter(file =>
      /<NoRegistrationNumberHelp[\s>]/.test(readFileSync(file, 'utf8'))
    );
    expect(wizardFiles.length).toBeGreaterThan(0);
    for (const file of wizardFiles) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/<NoRegistrationNumberHelp\b[^>]*?\/?>/gs)) {
        expect(match[0], relativePosix(SRC, file)).toMatch(/\bopensInNewTab\b/);
      }
    }
  });
});
