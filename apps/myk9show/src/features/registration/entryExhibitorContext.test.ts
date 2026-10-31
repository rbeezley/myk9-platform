import { describe, expect, it } from 'vitest';
import { resolveReturnFormKey } from './entryExhibitorContext';

describe('resolveReturnFormKey', () => {
  it('returns to the form when the dogs picked belong to the named exhibitor', () => {
    expect(resolveReturnFormKey({ returnFormKey: 'reg-1', exhibitorId: 'p1', ownerId: 'p1' })).toBe(
      'reg-1'
    );
  });

  it("returns to the plain list when the secretary picked someone else's dog", () => {
    expect(
      resolveReturnFormKey({ returnFormKey: 'reg-1', exhibitorId: 'p1', ownerId: 'p2' })
    ).toBeNull();
    expect(
      resolveReturnFormKey({ returnFormKey: 'reg-1', exhibitorId: 'p1', ownerId: undefined })
    ).toBeNull();
  });

  it('keeps a form key given without an exhibitor, and is null without a form', () => {
    expect(resolveReturnFormKey({ returnFormKey: 'reg-1', exhibitorId: null, ownerId: 'p2' })).toBe(
      'reg-1'
    );
    expect(
      resolveReturnFormKey({ returnFormKey: null, exhibitorId: 'p1', ownerId: 'p1' })
    ).toBeNull();
  });
});
