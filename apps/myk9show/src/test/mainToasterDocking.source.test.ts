import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '..', 'main.tsx'), 'utf8');

describe('Sonner toaster docking', () => {
  it('docks Sonner away from the custom top-right notification stack', () => {
    expect(source).toContain('position="bottom-right"');
    expect(source).toContain('offset={{');
    expect(source).toContain('mobileOffset={{');
    expect(source).toContain('env(safe-area-inset-right)');
    expect(source).toContain('env(safe-area-inset-bottom)');
    expect(source).not.toContain('position="top-right"');
  });
});
