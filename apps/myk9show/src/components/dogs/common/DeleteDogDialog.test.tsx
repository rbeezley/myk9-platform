import { describe, it, expect } from 'vitest';
import { buildDescription } from './deleteDogDialogCopy';

describe('DeleteDogDialog buildDescription', () => {
  it('shows the plain description when the dog has no active entries', () => {
    const text = buildDescription(0);
    expect(text).toBe(
      'This will mark the dog as deleted and hide it from normal view. An administrator can restore it later if needed.'
    );
    expect(text).not.toMatch(/entr/i);
  });

  it('treats undefined (count still loading) as no warning', () => {
    expect(buildDescription(undefined)).not.toMatch(/entr/i);
  });

  it('warns with the singular noun for exactly one entry', () => {
    const text = buildDescription(1);
    expect(text).toContain('1 active entry, which will also be removed');
    expect(text).not.toContain('entries');
  });

  it('warns with the plural noun for multiple entries', () => {
    const text = buildDescription(16);
    expect(text).toContain('16 active entries, which will also be removed');
  });

  it('always retains the restore note', () => {
    expect(buildDescription(3)).toContain('An administrator can restore it later');
  });
});
