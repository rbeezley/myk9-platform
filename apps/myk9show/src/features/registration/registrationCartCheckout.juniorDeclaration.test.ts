/**
 * MYK9-879: the exhibitor's junior-handler declaration at card checkout, and the
 * contract that the wizard's running total equals what checkout charges.
 *
 * The cart lines `submitRegistrationCartCheckout` writes are what stripe-checkout
 * reads, so the exact `entryFeeCents` on each `addItem` call, and the
 * `juniorFeeDeclared` flag beside it, are the charged amounts. The preview is
 * `calculateTotalFees` over the SAME selections, so one fixture asserts both.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  calculateTotalFees,
  type ShowFeeInfo,
} from '@/components/shows/RegistrationWorkflow/PaymentStep/utils';
import type { HandlerInfo } from '@/types/show-registration-types';
import { submitRegistrationCartCheckout } from './registrationCartCheckout';

const showFeeInfo: ShowFeeInfo = {
  preEntryFee: '30',
  dayOfShowFee: '45',
  juniorHandlerFee: '15',
  startDate: '2099-05-01',
};

const classSelections = [
  { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
  {
    dogId: 'dog-2',
    trialId: 'trial-1',
    selectedClasses: [{ classId: 'class-1' }, { classId: 'class-2' }],
  },
];
const classes = [
  { id: 'class-1', className: 'Interior Novice A', entryFee: 28 },
  { id: 'class-2', className: 'Exterior Novice A', entryFee: 28 },
];
const dogs = [
  { id: 'dog-1', name: 'Rocket' },
  { id: 'dog-2', name: 'Juno' },
];

function makeDeps() {
  return {
    clearCart: vi.fn().mockResolvedValue(true),
    ensureCart: vi.fn().mockResolvedValue({ kind: 'ready', cart: { id: 'cart-1', items: [] } }),
    addItem: vi.fn().mockResolvedValue(true),
    abandonCart: vi.fn().mockResolvedValue(true),
    navigate: vi.fn(),
  };
}

async function checkout(
  overrides: {
    juniorHandlerDogIds?: ReadonlySet<string>;
    showFeeInfo?: ShowFeeInfo;
    handlerAssignments?: Record<string, HandlerInfo>;
  } = {}
) {
  const deps = makeDeps();
  await submitRegistrationCartCheckout({
    showId: 'show-1',
    ownerResolution: { ok: true, ownerId: 'people-1' },
    exhibitorProfileId: 'profile-1',
    classSelections,
    handlerAssignments: overrides.handlerAssignments ?? {},
    classes,
    showFeeInfo: overrides.showFeeInfo ?? showFeeInfo,
    ...(overrides.juniorHandlerDogIds
      ? { juniorHandlerDogIds: overrides.juniorHandlerDogIds }
      : {}),
    deps,
  });
  const lines = deps.addItem.mock.calls.map(
    ([item]) =>
      item as { dogId: string; classId: string; entryFeeCents: number; juniorFeeDeclared?: boolean }
  );
  return { deps, lines };
}

function previewTotalCents(juniorDogIds: ReadonlySet<string>, show: ShowFeeInfo = showFeeInfo) {
  const result = calculateTotalFees(
    ['dog-1', 'dog-2'],
    classSelections,
    dogs,
    classes,
    show,
    new Set(),
    juniorDogIds
  );
  return Math.round(result.total * 100);
}

const sumCents = (lines: { entryFeeCents: number }[]) =>
  lines.reduce((sum, line) => sum + line.entryFeeCents, 0);

describe('submitRegistrationCartCheckout junior declaration', () => {
  it('writes the junior fee and the declaration for a declared dog only', async () => {
    const { lines } = await checkout({ juniorHandlerDogIds: new Set(['dog-1']) });
    expect(lines).toEqual([
      { dogId: 'dog-1', classId: 'class-1', entryFeeCents: 1500, juniorFeeDeclared: true },
      { dogId: 'dog-2', classId: 'class-1', entryFeeCents: 3000 },
      { dogId: 'dog-2', classId: 'class-2', entryFeeCents: 3000 },
    ]);
  });

  it('covers every class of a declared dog', async () => {
    const { lines } = await checkout({ juniorHandlerDogIds: new Set(['dog-2']) });
    expect(lines.map(l => [l.dogId, l.classId, l.entryFeeCents, l.juniorFeeDeclared])).toEqual([
      ['dog-1', 'class-1', 3000, undefined],
      ['dog-2', 'class-1', 1500, true],
      ['dog-2', 'class-2', 1500, true],
    ]);
  });

  it('charges the normal fee with no declaration (an adult handler)', async () => {
    const { lines } = await checkout();
    expect(lines.map(l => l.entryFeeCents)).toEqual([3000, 3000, 3000]);
    expect(lines.some(l => 'juniorFeeDeclared' in l)).toBe(false);
  });

  it('does not depend on who is assigned as handler or who owns the dog', async () => {
    // A parent owns the dog and registers it; the child handles it. The handler
    // assignment names a non-owner, and the junior fee still applies because the
    // exhibitor declared the handler a junior.
    const { lines } = await checkout({
      juniorHandlerDogIds: new Set(['dog-1']),
      handlerAssignments: {
        'dog-1|class-1': { handlerId: 'child-1', handlerName: 'Kid Handler', isOwner: false },
      },
    });
    expect(lines[0]).toMatchObject({
      dogId: 'dog-1',
      entryFeeCents: 1500,
      juniorFeeDeclared: true,
    });
  });

  it('drops the declaration on a show with no junior tier', async () => {
    for (const juniorHandlerFee of [undefined, '', '0']) {
      const { lines } = await checkout({
        juniorHandlerDogIds: new Set(['dog-1']),
        showFeeInfo: { ...showFeeInfo, juniorHandlerFee },
      });
      expect(lines.map(l => l.entryFeeCents)).toEqual([3000, 3000, 3000]);
      expect(lines.some(l => 'juniorFeeDeclared' in l)).toBe(false);
    }
  });

  it('caps a junior fee above the normal fee at the normal fee (the server LEAST)', async () => {
    const { lines } = await checkout({
      juniorHandlerDogIds: new Set(['dog-1']),
      showFeeInfo: { ...showFeeInfo, juniorHandlerFee: '40' },
    });
    expect(lines[0]).toMatchObject({
      dogId: 'dog-1',
      entryFeeCents: 3000,
      juniorFeeDeclared: true,
    });
  });

  it('ignores a declaration for a dog that is not in the registration', async () => {
    const { lines } = await checkout({ juniorHandlerDogIds: new Set(['dog-9']) });
    expect(lines.map(l => l.entryFeeCents)).toEqual([3000, 3000, 3000]);
  });
});

describe('the wizard preview equals what checkout charges', () => {
  it.each([
    ['no declaration', new Set<string>()],
    ['one dog declared', new Set(['dog-1'])],
    ['the multi-class dog declared', new Set(['dog-2'])],
    ['both dogs declared', new Set(['dog-1', 'dog-2'])],
  ])('%s', async (_label, declared) => {
    const { lines } = await checkout({ juniorHandlerDogIds: declared });
    expect(previewTotalCents(declared)).toBe(sumCents(lines));
  });

  it('pins the exact totals: 90.00 normal, 75.00 with dog-1, 60.00 with dog-2, 45.00 with both', () => {
    expect(previewTotalCents(new Set())).toBe(9000);
    expect(previewTotalCents(new Set(['dog-1']))).toBe(7500);
    expect(previewTotalCents(new Set(['dog-2']))).toBe(6000);
    expect(previewTotalCents(new Set(['dog-1', 'dog-2']))).toBe(4500);
  });

  it('agrees with the cart when the junior fee is capped', async () => {
    const capped = { ...showFeeInfo, juniorHandlerFee: '40' };
    const declared = new Set(['dog-1', 'dog-2']);
    const { lines } = await checkout({ juniorHandlerDogIds: declared, showFeeInfo: capped });
    expect(previewTotalCents(declared, capped)).toBe(sumCents(lines));
    expect(sumCents(lines)).toBe(9000);
  });
});
