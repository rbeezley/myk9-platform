import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '..', 'main.tsx'), 'utf8');

describe('Sonner toaster docking', () => {
  it('docks Sonner below fixed app chrome and away from bottom actions', () => {
    expect(source).toContain('position="top-right"');
    expect(source).toContain('offset={{');
    expect(source).toContain('mobileOffset={{');
    expect(source).toContain('var(--app-top-inset, 3rem)');
    expect(source).toContain('env(safe-area-inset-right)');
  });
});
