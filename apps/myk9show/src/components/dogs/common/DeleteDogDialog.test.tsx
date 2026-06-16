import { describe, it, expect } from 'vitest';
import { buildImpactSuffix, buildRestoreNote } from './deleteDogDialogCopy';

describe('DeleteDogDialog buildImpactSuffix', () => {
  it('is empty when the dog has no active entries', () => {
    expect(buildImpactSuffix(0)).toBe('');
  });

  it('is empty while the count is still loading (undefined)', () => {
    expect(buildImpactSuffix(undefined)).toBe('');
  });

  it('uses the singular noun for exactly one entry', () => {
    expect(buildImpactSuffix(1)).toBe(' and 1 entry');
  });

  it('uses the plural noun for multiple entries', () => {
    expect(buildImpactSuffix(2)).toBe(' and 2 entries');
  });
});

describe('DeleteDogDialog buildRestoreNote', () => {
  it('mentions only the dog when there are no entries', () => {
    expect(buildRestoreNote(0)).toBe(
      'The dog can be restored by an administrator from Admin → Data Lifecycle.'
    );
  });

  it('mentions the dog and its entries when entries cascade', () => {
    expect(buildRestoreNote(3)).toBe(
      'The dog and its entries can be restored by an administrator from Admin → Data Lifecycle.'
    );
  });

  it('never claims the action cannot be undone', () => {
    expect(buildRestoreNote(3)).not.toMatch(/cannot be undone/i);
    expect(buildRestoreNote(0)).not.toMatch(/cannot be undone/i);
  });
});
