import { describe, it, expect } from 'vitest';
import { buildImpactSuffix, buildWarningText } from './deleteDogDialogCopy';

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

describe('DeleteDogDialog buildWarningText', () => {
  it('tells a non-admin the action cannot be undone (restore UI is admin-only)', () => {
    expect(buildWarningText(2, false)).toBe('This action cannot be undone.');
    expect(buildWarningText(0, false)).toBe('This action cannot be undone.');
  });

  it('gives an admin the restore note, dog-only when there are no entries', () => {
    expect(buildWarningText(0, true)).toBe(
      'The dog can be restored by an administrator from Admin → Deleted Items.'
    );
  });

  it('gives an admin the restore note naming entries when they cascade', () => {
    expect(buildWarningText(3, true)).toBe(
      'The dog and its entries can be restored by an administrator from Admin → Deleted Items.'
    );
  });

  it('admin restore note never claims the action cannot be undone', () => {
    expect(buildWarningText(3, true)).not.toMatch(/cannot be undone/i);
  });
});
