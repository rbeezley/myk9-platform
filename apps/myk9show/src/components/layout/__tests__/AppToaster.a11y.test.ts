import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = resolve(fileURLToPath(import.meta.url), '..');
const appToaster = readFileSync(resolve(testDirectory, '..', 'AppToaster.tsx'), 'utf8');
const indexCss = readFileSync(resolve(testDirectory, '../../../index.css'), 'utf8');

describe('AppToaster accessibility contract', () => {
  it('keeps the scoped rich-color and close-control overrides mounted on the app toaster', () => {
    expect(appToaster).toContain('className="myk9-sonner-a11y"');
    expect(indexCss).toContain('[data-sonner-toaster].myk9-sonner-a11y');
    expect(indexCss).toContain('width: 44px;');
    expect(indexCss).toContain('height: 44px;');
    expect(indexCss).toContain('min-width: 44px;');
    expect(indexCss).toContain('min-height: 44px;');
  });

  it('defines every rich-color variant in both theme contexts', () => {
    for (const variant of ['success', 'info', 'warning', 'error']) {
      expect(indexCss).toContain(`data-type='${variant}'`);
      expect(indexCss).toContain(`data-sonner-theme='dark']`);
    }
  });

  it('clears stale actions when URL-driven navigation changes query or hash state', () => {
    expect(appToaster).toContain('const { pathname, search, hash } = useLocation();');
    expect(appToaster).toContain('}, [pathname, search, hash]);');
  });
});
