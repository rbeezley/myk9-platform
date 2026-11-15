/**
 * MYK9-1964: the wizard's card button reads "Pay $X" from the same money
 * resolution the entries panel draws "Total due" from. Each case renders the
 * panel, reads its Total due, and checks the button label names that figure,
 * which is also pinned arithmetically (entry fees plus the service fee).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import { EntriesPanel } from './EntriesPanel';
import { groupCartByDogAndDay, type PanelClass, type PanelDog } from './EntriesPanel.helpers';
import { resolveEntriesPanelMoney } from './EntriesPanel.money';
import { calculateTotalFees, type ShowFeeInfo } from '../PaymentStep/utils';
import {
  calculatePlatformFeeCents,
  formatCartCurrency,
  type PlatformFeeRates,
} from '@/store/cartStore.helpers';
import type { CartItemWithDetails } from '@/store/cartStore';
import { getPaymentSubmitLabel } from '@/pages/RegistrationWizardPage/commitLabels';

const RATES: PlatformFeeRates = { percent: 7, flatCents: 0, minCents: 0 };

vi.mock('@/hooks/queries/usePlatformFeeRates', () => ({
  usePlatformFeeRates: () => RATES,
}));

const DOGS = new Map<string, PanelDog>([
  ['dog-1', { id: 'dog-1', name: 'Ridgeside Rover', callName: 'Rover' }],
  ['dog-2', { id: 'dog-2', name: 'Ridgeside Juno', callName: 'Juno' }],
]);
const TRIALS = new Map([['trial-1', { id: 'trial-1', name: 'Trial 1', trialDate: '2026-08-01' }]]);

interface Scenario {
  name: string;
  dogIds: string[];
  classCount: number;
  show: ShowFeeInfo;
  juniorDogIds?: string[];
  /** Per-line price, in dollars, that the cart lines carry. */
  lineFee: number;
  /** Entry fees the scenario must total to, in cents. */
  entryFeeCents: number;
}

const PRE_ENTRY: ShowFeeInfo = {
  preEntryFee: '30',
  dayOfShowFee: '35',
  startDate: '2099-05-01',
  entryCloseDate: '2099-04-20',
  entryWindowTimezone: 'America/New_York',
};

const SCENARIOS: Scenario[] = [
  {
    name: 'one class',
    dogIds: ['dog-1'],
    classCount: 1,
    show: PRE_ENTRY,
    lineFee: 30,
    entryFeeCents: 3000,
  },
  {
    name: 'several dogs',
    dogIds: ['dog-1', 'dog-2'],
    classCount: 2,
    show: PRE_ENTRY,
    lineFee: 30,
    entryFeeCents: 12000,
  },
  {
    name: 'a junior handler fee',
    dogIds: ['dog-1', 'dog-2'],
    classCount: 1,
    show: { ...PRE_ENTRY, juniorHandlerFee: '20' },
    juniorDogIds: ['dog-2'],
    lineFee: 30,
    // Rover at the regular $30, Juno at the $20 junior tier.
    entryFeeCents: 5000,
  },
  {
    name: 'a day-of fee',
    dogIds: ['dog-1'],
    classCount: 1,
    // Entries closed yesterday: the day-of tier applies.
    show: { ...PRE_ENTRY, startDate: '2026-11-16', entryCloseDate: '2026-11-14' },
    lineFee: 35,
    entryFeeCents: 3500,
  },
];

function panelClasses(count: number): Map<string, PanelClass> {
  return new Map(
    Array.from({ length: count }, (_, index) => [
      `class-${index}`,
      {
        id: `class-${index}`,
        trialId: 'trial-1',
        element: 'Container',
        level: `Level ${index}`,
        className: `Class ${index}`,
      },
    ])
  );
}

function build(scenario: Scenario) {
  const classIds = Array.from({ length: scenario.classCount }, (_, index) => `class-${index}`);
  const selections = scenario.dogIds.map(dogId => ({
    dogId,
    trialId: 'trial-1',
    selectedClasses: classIds.map(classId => ({ classId })),
  }));
  const feeCalculation = calculateTotalFees(
    scenario.dogIds,
    selections,
    scenario.dogIds.map(id => ({ id, name: DOGS.get(id)?.name ?? id })),
    classIds.map(id => ({ id, className: id, entryFee: 25 })),
    scenario.show,
    new Set(),
    new Set(scenario.juniorDogIds ?? [])
  );
  const items = scenario.dogIds.flatMap(dogId =>
    classIds.map((classId, index): CartItemWithDetails => ({
      id: `${dogId}-${index}`,
      cart_id: 'cart-1',
      dog_id: dogId,
      class_id: classId,
      handler_id: null,
      entry_fee_cents: scenario.lineFee * 100,
      jump_height: null,
      special_requests: null,
      junior_fee_declared: false,
      created_at: '2026-06-28T00:00:00.000Z',
    }))
  );
  const groups = groupCartByDogAndDay(
    items,
    DOGS,
    panelClasses(scenario.classCount),
    TRIALS,
    scenario.dogIds
  );
  return { feeCalculation, groups };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('the card button names the Total due the panel shows (MYK9-1964)', () => {
  it.each(SCENARIOS)('$name', scenario => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-15T15:00:00.000Z'));
    const { feeCalculation, groups } = build(scenario);

    render(
      <EntriesPanel
        groups={groups}
        variant="payment"
        paymentMethod="credit_card"
        feeCalculation={feeCalculation}
      />
    );
    const totalDue = within(screen.getByTestId('entries-panel'))
      .getByText('Total due')
      .parentElement?.querySelector('.tabular-nums')?.textContent;

    const label = getPaymentSubmitLabel(
      'credit_card',
      resolveEntriesPanelMoney({
        groups,
        variant: 'payment',
        paymentMethod: 'credit_card',
        feeCalculation,
        capacityReady: true,
        rates: RATES,
      })
    );

    const expectedCents =
      scenario.entryFeeCents + calculatePlatformFeeCents(scenario.entryFeeCents, RATES);
    expect(totalDue).toBe(formatCartCurrency(expectedCents));
    expect(label).toBe(`Pay ${totalDue}`);
  });

  it('reads $32.10 for one $30 class at a 7% service fee', () => {
    const { feeCalculation, groups } = build(SCENARIOS[0]!);
    const money = resolveEntriesPanelMoney({
      groups,
      variant: 'payment',
      paymentMethod: 'credit_card',
      feeCalculation,
      capacityReady: true,
      rates: RATES,
    });
    expect(getPaymentSubmitLabel('credit_card', money)).toBe('Pay $32.10');
  });

  it('names no figure before availability is known', () => {
    const { feeCalculation, groups } = build(SCENARIOS[0]!);
    const money = resolveEntriesPanelMoney({
      groups,
      variant: 'payment',
      paymentMethod: 'credit_card',
      feeCalculation,
      capacityReady: false,
      rates: RATES,
    });
    expect(getPaymentSubmitLabel('credit_card', money)).toBe('Pay');
  });
});
