import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-48 task 3.1 — Class Management lifecycle presets must reuse the
 * existing `deriveClassLifecycleValue` derivation used by the page's summary
 * tiles, not re-implement a second raw-status -> lifecycle mapping for the
 * status filter. This pins the page's source so a future edit can't
 * reintroduce a duplicated switch/lookup without failing CI.
 */
function readSource(): string {
  return readFileSync(join(__dirname, '..', 'ClassManagementPage.tsx'), 'utf8');
}

describe('ClassManagementPage lifecycle filter reuse', () => {
  it('imports deriveClassLifecycleValue from the shared classLifecycle module', () => {
    const source = readSource();
    expect(source).toMatch(
      /import\s*\{\s*deriveClassLifecycleValue[^}]*\}\s*from\s*'@\/lib\/status\/classLifecycle'/
    );
  });

  it('filters by calling deriveClassLifecycleValue against the status filter, not a raw status compare', () => {
    const source = readSource();
    expect(source).toContain('deriveClassLifecycleValue(cls.status) === statusFilter');
    // The old raw-status comparison must be gone.
    expect(source).not.toContain('cls.status === statusFilter');
  });

  it('does not define a second lifecycle/status mapping table on the page', () => {
    const source = readSource();
    // No local switch statement or CLASS_STATUS-keyed record redefining the
    // lifecycle buckets — the only source of truth is the imported helper.
    expect(source).not.toMatch(/switch\s*\(\s*(cls\.status|status)\s*\)/);
    expect(source).not.toContain('CLASS_STATUS');
  });
});
