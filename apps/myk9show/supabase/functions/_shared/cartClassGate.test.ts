import { describe, expect, it } from 'vitest';
import { cartHasBlockedClass, newLineClassIds } from './cartClassGate';

describe('stripe-checkout class gate (MYK9-656)', () => {
  const availability = [
    { class_id: 'class-cancelled', self_service_block: 'cancelled' },
    { class_id: 'class-full', self_service_block: 'full' },
    { class_id: 'class-open', self_service_block: null },
  ];

  it('refuses a cart with a new line in a closed or full class', () => {
    expect(
      cartHasBlockedClass(
        [{ class_id: 'class-open' }, { class_id: 'class-cancelled', entry_id: null }],
        availability
      )
    ).toBe(true);
    expect(cartHasBlockedClass([{ class_id: 'class-full' }], availability)).toBe(true);
  });

  it('lets a cart through when every new line is in an open class', () => {
    expect(cartHasBlockedClass([{ class_id: 'class-open' }], availability)).toBe(false);
  });

  it('never blocks a Finish Payment line, which settles an entry that already exists', () => {
    expect(
      cartHasBlockedClass([{ class_id: 'class-cancelled', entry_id: 'entry-1' }], availability)
    ).toBe(false);
    expect(newLineClassIds([{ class_id: 'class-cancelled', entry_id: 'entry-1' }])).toEqual([]);
  });

  it('asks about each new line class once', () => {
    expect(
      newLineClassIds([
        { class_id: 'class-open' },
        { class_id: 'class-open' },
        { class_id: 'class-full', entry_id: null },
      ])
    ).toEqual(['class-open', 'class-full']);
  });
});
