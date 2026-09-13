import { describe, expect, it } from 'vitest';
import {
  cartItemsFromFeeBreakdown,
  countPanelLines,
  groupCartByDogAndDay,
  sumPanelFeeCents,
  type PanelClass,
  type PanelDog,
  type PanelTrial,
} from './EntriesPanel.helpers';
import type { CartItemWithDetails } from '@/store/cartStore';

/**
 * Fixtures use the EXACT shapes the app emits, not invented ones
 * (LESSONS `assertion-first-ui-id-shapes`):
 *  - cart rows are `entry_cart_items` rows joined with `class` —
 *    snake_case columns, `entry_fee_cents` as an integer, matching
 *    `features/payments/cartCapacitySplit.test.ts`.
 *  - the panel's own line key is `dogId:classId`, the same composite key
 *    `reconcileCartToSelections` and PaymentStep's `removingLineKey` use.
 *  - trials come from `useTrialStore` (`trialDate` is a bare `YYYY-MM-DD`
 *    DATE column), classes from `useClassStoreCompat` (`trialId`, `element`,
 *    `level`, `className`).
 */
function cartItem(
  overrides: Partial<CartItemWithDetails> & { dog_id: string; class_id: string }
): CartItemWithDetails {
  return {
    id: `item-${overrides.dog_id}-${overrides.class_id}`,
    cart_id: 'cart-1',
    handler_id: null,
    entry_fee_cents: 2500,
    jump_height: null,
    special_requests: null,
    created_at: '2026-06-28T00:00:00.000Z',
    ...overrides,
  };
}

const dogs = new Map<string, PanelDog>([
  ['dog-1', { id: 'dog-1', name: 'Ridgeside Rover', callName: 'Rover' }],
  ['dog-2', { id: 'dog-2', name: 'Ridgeside Juno', callName: null }],
]);

const trials = new Map<string, PanelTrial>([
  ['trial-sat', { id: 'trial-sat', name: 'Trial 1', trialDate: '2026-08-01' }],
  ['trial-sun', { id: 'trial-sun', name: 'Trial 2', trialDate: '2026-08-02' }],
]);

const classes = new Map<string, PanelClass>([
  [
    'class-a',
    {
      id: 'class-a',
      trialId: 'trial-sat',
      element: 'Container',
      level: 'Advanced',
      className: 'Container Advanced',
    },
  ],
  [
    'class-b',
    {
      id: 'class-b',
      trialId: 'trial-sun',
      element: 'Interior',
      level: 'Novice',
      className: 'Interior Novice',
    },
  ],
  [
    'class-c',
    { id: 'class-c', trialId: 'trial-sat', element: null, level: null, className: 'Detective' },
  ],
]);

describe('groupCartByDogAndDay', () => {
  it('groups cart rows per dog with the trial day, level and fee', () => {
    const groups = groupCartByDogAndDay(
      [
        cartItem({ dog_id: 'dog-1', class_id: 'class-b', entry_fee_cents: 3000 }),
        cartItem({ dog_id: 'dog-1', class_id: 'class-a' }),
      ],
      dogs,
      classes,
      trials,
      ['dog-1']
    );

    expect(groups).toEqual([
      {
        dogId: 'dog-1',
        dogName: 'Rover',
        lines: [
          {
            lineKey: 'dog-1:class-a',
            classId: 'class-a',
            dayLabel: 'Sat',
            label: 'Container Advanced',
            feeCents: 2500,
          },
          {
            lineKey: 'dog-1:class-b',
            classId: 'class-b',
            dayLabel: 'Sun',
            label: 'Interior Novice',
            feeCents: 3000,
          },
        ],
      },
    ]);
  });

  it('lists a selected dog with no cart rows so the panel can say "no classes yet"', () => {
    const groups = groupCartByDogAndDay(
      [cartItem({ dog_id: 'dog-1', class_id: 'class-a' })],
      dogs,
      classes,
      trials,
      ['dog-2', 'dog-1']
    );

    expect(groups.map(g => [g.dogId, g.lines.length])).toEqual([
      ['dog-2', 0],
      ['dog-1', 1],
    ]);
    // Falls back to the registered name when there is no call name.
    expect(groups[0].dogName).toBe('Ridgeside Juno');
  });

  it('keeps a cart row whose dog is not in the selected list', () => {
    const groups = groupCartByDogAndDay(
      [cartItem({ dog_id: 'dog-2', class_id: 'class-a' })],
      dogs,
      classes,
      trials,
      ['dog-1']
    );

    expect(groups.map(g => g.dogId)).toEqual(['dog-1', 'dog-2']);
  });

  it('falls back to the joined class on the cart row when the class store is cold', () => {
    const groups = groupCartByDogAndDay(
      [
        cartItem({
          dog_id: 'dog-1',
          class_id: 'class-z',
          class: {
            id: 'class-z',
            name: 'Exterior Excellent',
            level: 'Excellent',
            trial_id: 'trial-sun',
            allow_waitlist: null,
          },
        }),
      ],
      dogs,
      new Map(),
      trials,
      ['dog-1']
    );

    expect(groups[0].lines[0]).toMatchObject({
      label: 'Exterior Excellent',
      dayLabel: 'Sun',
    });
  });

  it('renders an element-less class by its stored name and no day when the trial is unknown', () => {
    const groups = groupCartByDogAndDay(
      [cartItem({ dog_id: 'dog-1', class_id: 'class-c' })],
      dogs,
      classes,
      new Map(),
      ['dog-1']
    );

    expect(groups[0].lines[0]).toMatchObject({ label: 'Detective', dayLabel: '' });
  });

  it('names an unknown dog rather than dropping its fees', () => {
    const groups = groupCartByDogAndDay(
      [cartItem({ dog_id: 'dog-9', class_id: 'class-a' })],
      dogs,
      classes,
      trials,
      []
    );

    expect(groups[0]).toMatchObject({ dogId: 'dog-9', dogName: 'Dog' });
  });
});

describe('sumPanelFeeCents / countPanelLines', () => {
  const groups = groupCartByDogAndDay(
    [
      cartItem({ dog_id: 'dog-1', class_id: 'class-a', entry_fee_cents: 2500 }),
      cartItem({ dog_id: 'dog-1', class_id: 'class-b', entry_fee_cents: 3000 }),
      cartItem({ dog_id: 'dog-2', class_id: 'class-a', entry_fee_cents: 2500 }),
    ],
    dogs,
    classes,
    trials,
    ['dog-1', 'dog-2']
  );

  it('totals entry fees in integer cents across every dog', () => {
    expect(sumPanelFeeCents(groups)).toBe(8000);
  });

  it('counts class lines, not dogs', () => {
    expect(countPanelLines(groups)).toBe(3);
  });

  it('is zero for a selection with no classes', () => {
    const empty = groupCartByDogAndDay([], dogs, classes, trials, ['dog-1', 'dog-2']);
    expect(sumPanelFeeCents(empty)).toBe(0);
    expect(countPanelLines(empty)).toBe(0);
  });
});

describe('cartItemsFromFeeBreakdown', () => {
  it('projects the fee breakdown into cart rows keyed dogId:classId, in cents', () => {
    expect(
      cartItemsFromFeeBreakdown([
        {
          dogId: 'dog-1',
          dogName: 'Rover',
          subtotal: 55,
          classes: [
            { classId: 'class-a', className: 'Container Advanced', fee: 30 },
            { classId: 'class-b', className: 'Interior Novice', fee: 25 },
          ],
        },
      ])
    ).toMatchObject([
      { id: 'dog-1:class-a', dog_id: 'dog-1', class_id: 'class-a', entry_fee_cents: 3000 },
      { id: 'dog-1:class-b', dog_id: 'dog-1', class_id: 'class-b', entry_fee_cents: 2500 },
    ]);
  });

  it('rounds a fractional fee to integer cents once', () => {
    const [item] = cartItemsFromFeeBreakdown([
      {
        dogId: 'dog-1',
        dogName: 'Rover',
        subtotal: 12.345,
        classes: [{ classId: 'class-a', className: 'A', fee: 12.345 }],
      },
    ]);
    expect(item.entry_fee_cents).toBe(1235);
  });

  it('groups its own output back into the panel rows the wizard renders', () => {
    const groups = groupCartByDogAndDay(
      cartItemsFromFeeBreakdown([
        {
          dogId: 'dog-1',
          dogName: 'Rover',
          subtotal: 30,
          classes: [{ classId: 'class-a', className: 'Container Advanced', fee: 30 }],
        },
      ]),
      dogs,
      classes,
      trials,
      ['dog-1']
    );
    expect(groups[0].lines[0]).toMatchObject({
      lineKey: 'dog-1:class-a',
      dayLabel: 'Sat',
      label: 'Container Advanced',
      feeCents: 3000,
    });
    expect(sumPanelFeeCents(groups)).toBe(3000);
  });
});

/**
 * Two classes that differ ONLY by section rendered identically in the panel and
 * in the remove confirmation, so "Remove Container Novice" named either of them
 * (Codex #2210 P2). The rule is the shared one from PR #2196, not a new one:
 * the section is rendered, and the name-collision case is delegated to
 * `buildClassDisambiguator` (LESSONS `label-rule-vs-real-columns`).
 */
describe('groupCartByDogAndDay class labels', () => {
  const sectioned = new Map<string, PanelClass>([
    [
      'class-a',
      {
        id: 'class-a',
        trialId: 'trial-1',
        element: 'Container',
        level: 'Novice',
        section: 'A',
        className: 'Container Novice A',
      },
    ],
    [
      'class-b',
      {
        id: 'class-b',
        trialId: 'trial-1',
        element: 'Container',
        level: 'Novice',
        section: 'B',
        className: 'Container Novice B',
      },
    ],
  ]);

  it('tells two classes apart when only their section differs', () => {
    const groups = groupCartByDogAndDay(
      [
        cartItem({ dog_id: 'dog-1', class_id: 'class-a' }),
        cartItem({ dog_id: 'dog-1', class_id: 'class-b' }),
      ],
      dogs,
      sectioned,
      trials,
      ['dog-1']
    );

    const labels = groups[0]!.lines.map(line => line.label);
    expect(labels).toContain('Container Novice A');
    expect(labels).toContain('Container Novice B');
    expect(new Set(labels).size).toBe(2);
  });

  it('adds no extra words to a class that has no twin', () => {
    const solo = new Map<string, PanelClass>([
      [
        'class-a',
        {
          id: 'class-a',
          trialId: 'trial-1',
          element: 'Interior',
          level: 'Advanced',
          // A fixture-ish stored name that must NOT reach the exhibitor while
          // nothing collides with it.
          className: 'Interior Advanced Load 2 Class 1',
        },
      ],
    ]);
    const groups = groupCartByDogAndDay(
      [cartItem({ dog_id: 'dog-1', class_id: 'class-a' })],
      dogs,
      solo,
      trials,
      ['dog-1']
    );

    expect(groups[0]!.lines[0]!.label).toBe('Interior Advanced');
  });

  it('distinguishes a genuine collision using the shared disambiguator', () => {
    // The Heartland case: same element and level, no section, different names.
    const colliding = new Map<string, PanelClass>([
      [
        'class-a',
        {
          id: 'class-a',
          trialId: 'trial-1',
          element: 'Interior',
          level: 'Advanced',
          className: 'Interior Advanced',
        },
      ],
      [
        'class-b',
        {
          id: 'class-b',
          trialId: 'trial-1',
          element: 'Interior',
          level: 'Advanced',
          className: 'Interior Advanced Preliminary',
        },
      ],
    ]);
    const groups = groupCartByDogAndDay(
      [
        cartItem({ dog_id: 'dog-1', class_id: 'class-a' }),
        cartItem({ dog_id: 'dog-1', class_id: 'class-b' }),
      ],
      dogs,
      colliding,
      trials,
      ['dog-1']
    );

    const labels = groups[0]!.lines.map(line => line.label);
    expect(new Set(labels).size).toBe(2);
    expect(labels).toContain('Interior Advanced Preliminary');
  });
});
