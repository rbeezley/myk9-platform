import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-1973: leaving the entry wizard in the same tab drops the selected dogs
 * and the current step, so every link rendered by the wizard opens in a new
 * tab. This walks the wizard's source for link elements, so a new same-tab
 * link fails here. Imperative `navigate()` calls are the wizard's own exits
 * (Cancel, Back, post-submit) and are not links.
 */
const SRC = join(__dirname, '..', '..');
const ROOTS = [
  join(SRC, 'components/shows/RegistrationWorkflow'),
  join(SRC, 'pages/RegistrationWizardPage'),
  join(SRC, 'pages/RegistrationWizardPage.tsx'),
  join(SRC, 'components/dogs/NoRegistrationNumberHelp.tsx'),
];

function sourceFiles(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap(name => {
    const child = join(path, name);
    if (statSync(child).isDirectory()) return name === '__tests__' ? [] : sourceFiles(child);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [child] : [];
  });
}

/** Every `<Link`, `<NavLink` and `<a` opening tag, read to its closing `>` (braces balanced). */
function linkOpeningTags(source: string): string[] {
  const tags: string[] = [];
  for (const match of source.matchAll(/<(Link|NavLink|a)(?=[\s>])/g)) {
    let depth = 0;
    let i = match.index;
    for (; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0 && source[i - 1] !== '=') break;
    }
    tags.push(source.slice(match.index, i + 1));
  }
  return tags;
}

describe('links out of the entry wizard', () => {
  const found = ROOTS.flatMap(sourceFiles).flatMap(file =>
    linkOpeningTags(readFileSync(file, 'utf8')).map(tag => ({
      where: `${relative(SRC, file)}: ${tag.replace(/\s+/g, ' ').slice(0, 80)}`,
      tag,
    }))
  );

  it('finds the wizard link set (guards the walker itself)', () => {
    expect(found.length).toBeGreaterThanOrEqual(7);
  });

  it.each(found.map(f => [f.where, f.tag] as const))('opens in a new tab: %s', (_where, tag) => {
    expect(tag).toMatch(/target(=|:\s*)["']_blank["']/);
    expect(tag).toMatch(/noopener noreferrer/);
  });
});
