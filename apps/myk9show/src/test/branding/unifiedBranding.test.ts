import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const brandName = ['my', 'K9', 'Q'].join('');
const lowercaseBrand = brandName.toLowerCase();
const approvedLineage =
  'It&apos;s the ringside experience you may know as myK9Q, now built right in.';

const SEARCH_ROOTS = [
  'index.html',
  'public/legal',
  'src/components/landing',
  'src/components/pwa',
  'src/components/preferences',
  'src/components/reports/labels',
  'src/data',
  'src/pages/SmartSignInPage.tsx',
  'src/pages/PasswordSubForm.tsx',
];

const SKIP_FILES = new Set([
  'src/components/landing/v2/HomeBranding.test.tsx',
  'src/components/preferences/DataSettings.tsx',
  'src/components/preferences/__tests__/DataSettings.test.tsx',
  'src/test/branding/unifiedBranding.test.ts',
]);

const TEXT_EXTENSIONS = new Set(['.html', '.md', '.ts', '.tsx']);

function listFiles(path: string): string[] {
  const stats = statSync(path);
  if (stats.isFile()) return [path];

  return readdirSync(path).flatMap(entry => listFiles(join(path, entry)));
}

function hasTextExtension(path: string): boolean {
  return [...TEXT_EXTENSIONS].some(extension => path.endsWith(extension));
}

describe('unified app branding', () => {
  it('keeps legacy Q naming out of user-facing myK9Show surfaces', () => {
    const appRoot = process.cwd();
    const matches = SEARCH_ROOTS.flatMap(root => listFiles(join(appRoot, root)))
      .filter(hasTextExtension)
      .flatMap(file => {
        const rel = relative(appRoot, file);
        if (SKIP_FILES.has(rel)) return [];

        const content = readFileSync(file, 'utf8').replace(approvedLineage, '');
        if (!content.includes(brandName) && !content.toLowerCase().includes(lowercaseBrand)) {
          return [];
        }
        return [rel];
      });

    expect(matches).toEqual([]);
  });
});
