import { describe, expect, it } from 'vitest';
import { registrationToCartItems } from './registrationToCartItems';

describe('registrationToCartItems', () => {
  it('maps one selected class to a cart item with fee, handler, and jump height', () => {
    const items = registrationToCartItems(
      [
        {
          dogId: 'dog-1',
          trialId: 'trial-1',
          selectedClasses: [{ classId: 'class-1', jumpHeight: '16' }],
        },
      ],
      {
        'dog-1|class-1': { handlerId: 'handler-1', handlerName: 'Pat Handler' },
      },
      [{ id: 'class-1', entryFee: 20 }],
      {
        preEntryFee: '25',
        dayOfShowFee: '30',
        startDate: '2099-05-01',
      }
    );

    expect(items).toEqual([
      {
        dogId: 'dog-1',
        classId: 'class-1',
        handlerId: 'handler-1',
        jumpHeight: '16',
        entryFeeCents: 2500,
      },
    ]);
  });
});
