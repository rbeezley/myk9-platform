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

  it('maps selections across multiple dogs to separate cart items', () => {
    const items = registrationToCartItems(
      [
        {
          dogId: 'dog-1',
          trialId: 'trial-1',
          selectedClasses: [{ classId: 'class-1' }],
        },
        {
          dogId: 'dog-2',
          trialId: 'trial-1',
          selectedClasses: [{ classId: 'class-2', jumpHeight: '20' }],
        },
      ],
      {
        'dog-2|class-2': { handlerId: 'handler-2', handlerName: 'Riley Handler' },
      },
      [
        { id: 'class-1', entryFee: 18 },
        { id: 'class-2', entryFee: 22 },
      ],
      {
        preEntryFee: '25',
        startDate: '2099-05-01',
      }
    );

    expect(items).toEqual([
      {
        dogId: 'dog-1',
        classId: 'class-1',
        handlerId: undefined,
        jumpHeight: undefined,
        entryFeeCents: 2500,
      },
      {
        dogId: 'dog-2',
        classId: 'class-2',
        handlerId: 'handler-2',
        jumpHeight: '20',
        entryFeeCents: 2500,
      },
    ]);
  });

  it('uses the show pre-entry fee when a selected class is missing from loaded classes', () => {
    const items = registrationToCartItems(
      [
        {
          dogId: 'dog-1',
          trialId: 'trial-1',
          selectedClasses: [{ classId: 'missing-class' }],
        },
      ],
      {},
      [],
      {
        preEntryFee: '27.50',
        startDate: '2099-05-01',
      }
    );

    expect(items).toEqual([
      {
        dogId: 'dog-1',
        classId: 'missing-class',
        handlerId: undefined,
        jumpHeight: undefined,
        entryFeeCents: 2750,
      },
    ]);
  });

  it('returns no cart items when there are no selected classes', () => {
    const items = registrationToCartItems(
      [
        {
          dogId: 'dog-1',
          trialId: 'trial-1',
          selectedClasses: [],
        },
      ],
      {},
      [{ id: 'class-1', entryFee: 20 }],
      {
        preEntryFee: '25',
        startDate: '2099-05-01',
      }
    );

    expect(items).toEqual([]);
  });
});
