import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import { EntriesPanel } from './EntriesPanel';
import {
  groupCartByDogAndDay,
  type PanelClass,
  type PanelDog,
  type PanelTrial,
} from './EntriesPanel.helpers';
import { calculateTotalFees } from '../PaymentStep/utils';
import { calculatePlatformFeeCents, type PlatformFeeRates } from '@/store/cartStore.helpers';
import type { CartItemWithDetails } from '@/store/cartStore';
import type { PaymentMethod } from '@/types/show-registration-types';

const state = vi.hoisted(() => ({
  rates: { percent: 7, flatCents: 0, minCents: 0 } as PlatformFeeRates,
}));

vi.mock('@/hooks/queries/usePlatformFeeRates', () => ({
  usePlatformFeeRates: () => state.rates,
}));

const dogs = new Map<string, PanelDog>([
  ['dog-1', { id: 'dog-1', name: 'Ridgeside Rover', callName: 'Rover' }],
  ['dog-2', { id: 'dog-2', name: 'Ridgeside Juno', callName: 'Juno' }],
]);
const trials = new Map<string, PanelTrial>([
  ['trial-1', { id: 'trial-1', name: 'Trial 1', trialDate: '2026-08-01' }],
]);

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

function cartItems(count: number, dogId = 'dog-1'): CartItemWithDetails[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `item-${index}`,
    cart_id: 'cart-1',
    dog_id: dogId,
    class_id: `class-${index}`,
    handler_id: null,
    entry_fee_cents: 3000,
    jump_height: null,
    special_requests: null,
    created_at: '2026-06-28T00:00:00.000Z',
  }));
}

/** The SAME fee calculation the payment step feeds its summary. */
function fees(classCount = 1, waitlist = false) {
  const classes = Array.from({ length: classCount }, (_, index) => ({
    id: `class-${index}`,
    className: `Class ${index}`,
    entryFee: 30,
  }));
  return calculateTotalFees(
    ['dog-1'],
    [
      {
        dogId: 'dog-1',
        trialId: 'trial-1',
        selectedClasses: classes.map(c => ({ classId: c.id })),
      },
    ],
    [{ id: 'dog-1', name: 'Rover' }],
    classes,
    undefined,
    new Set(waitlist ? classes.map(c => c.id) : [])
  );
}

function groupsFor(classCount: number, dogIds = ['dog-1']) {
  return groupCartByDogAndDay(
    dogIds.flatMap(dogId => cartItems(classCount, dogId)),
    dogs,
    panelClasses(classCount),
    trials,
    dogIds
  );
}

function renderPanel(props: Partial<React.ComponentProps<typeof EntriesPanel>> = {}) {
  return render(<EntriesPanel groups={groupsFor(1)} {...props} />);
}

function paymentPanel(props: Partial<React.ComponentProps<typeof EntriesPanel>> = {}) {
  return (
    <EntriesPanel
      groups={groupsFor(1)}
      variant="payment"
      paymentMethod="credit_card"
      feeCalculation={fees()}
      waiveFees={false}
      feeOverride={null}
      {...props}
    />
  );
}

/** The panel's own desktop aside — the phone bar renders the same numbers. */
function aside() {
  return within(screen.getByTestId('entries-panel'));
}

beforeEach(() => {
  state.rates = { percent: 7, flatCents: 0, minCents: 0 };
});

/**
 * These figures were the RETIRED `PaymentSummaryCard`'s. The assertions were
 * written and run against BOTH renderings before the card was deleted — the
 * card's own quotes ($32.10 at 7% on a $30 entry, $99.30 with a flat 30¢ over
 * three classes, the $2.50 floor) are reproduced here verbatim, and the
 * expected value is independently recomputed from `calculatePlatformFeeCents`
 * so the pin is arithmetic, not a screenshot of the old component.
 */
describe('EntriesPanel payment total agrees with the retired PaymentSummaryCard', () => {
  it.each([
    { rates: { percent: 7, flatCents: 0, minCents: 0 }, classCount: 1 },
    { rates: { percent: 10, flatCents: 30, minCents: 100 }, classCount: 3 },
    { rates: { percent: 1, flatCents: 30, minCents: 250 }, classCount: 1 },
    { rates: { percent: 14.5, flatCents: 0, minCents: 0 }, classCount: 2 },
  ])('quotes the same amount due as the card for %j', ({ rates, classCount }) => {
    state.rates = rates;
    const feeCalculation = fees(classCount);
    const entryFeeCents = Math.round(feeCalculation.total * 100);
    const expected = entryFeeCents + calculatePlatformFeeCents(entryFeeCents, rates);
    const expectedText = `$${(expected / 100).toFixed(2)}`;

    render(paymentPanel({ groups: groupsFor(classCount), feeCalculation }));
    expect(aside().getByText('Total due')).toBeInTheDocument();
    expect(aside().getAllByText(expectedText).length).toBeGreaterThan(0);
  });

  it.each(['check', 'cash', 'secretary_paid', 'group_payment', ''] as const)(
    'drops the service fee when the method is %s',
    paymentMethod => {
      render(paymentPanel({ paymentMethod: paymentMethod as PaymentMethod | '' }));
      expect(aside().getAllByText('$30.00').length).toBeGreaterThan(0);
      expect(aside().queryByText(/Service fee/)).not.toBeInTheDocument();
    }
  );

  it.each([{ paymentMethod: 'waived' as const }, { waiveFees: true }])(
    'keeps waived fees at zero: %j',
    props => {
      render(paymentPanel(props));
      expect(aside().getByText('$0.00 (Waived)')).toBeInTheDocument();
      expect(aside().queryByText(/Service fee/)).not.toBeInTheDocument();
    }
  );

  it('preserves a manual non-card fee override', () => {
    render(paymentPanel({ paymentMethod: 'check', feeOverride: 15 }));
    expect(aside().getAllByText('$15.00').length).toBeGreaterThan(0);
    expect(aside().queryByText(/Service fee/)).not.toBeInTheDocument();
  });

  it('does not charge wait-list-only entries even with a fee floor', () => {
    state.rates = { percent: 7, flatCents: 30, minCents: 250 };
    render(paymentPanel({ groups: groupsFor(2), feeCalculation: fees(2, true) }));
    expect(aside().getAllByText('$0.00').length).toBeGreaterThan(0);
    expect(aside().queryByText(/Service fee/)).not.toBeInTheDocument();
  });

  it('withholds the fee and total while availability is unresolved', () => {
    render(paymentPanel({ capacityReady: false }));
    expect(aside().getAllByText('Checking availability').length).toBeGreaterThan(0);
    expect(aside().queryByText(/Service fee/)).not.toBeInTheDocument();
    expect(aside().queryByText('$32.10')).not.toBeInTheDocument();
  });

  it('explains why Next is blocked when payment is due but no method is chosen', () => {
    render(paymentPanel({ paymentMethod: '' }));
    expect(aside().getByText('Not selected')).toBeInTheDocument();
    expect(aside().getByText(/Choose a payment method to continue/i)).toBeInTheDocument();
  });

  it('drops the missing-method hint once a method is chosen', () => {
    render(paymentPanel({ paymentMethod: 'check' }));
    expect(aside().getByText('Check at Show')).toBeInTheDocument();
    expect(aside().queryByText(/Choose a payment method to continue/i)).not.toBeInTheDocument();
  });
});

describe('EntriesPanel before payment', () => {
  it('itemises each dog by trial day and level with an entry-fee total', () => {
    renderPanel({ groups: groupsFor(2) });
    const panel = aside();
    expect(panel.getByText('Rover')).toBeInTheDocument();
    expect(panel.getByText('Container Level 0')).toBeInTheDocument();
    expect(panel.getAllByText('Sat ·').length).toBe(2);
    expect(panel.getByText('2 classes')).toBeInTheDocument();
    expect(panel.getByText('Entry fees')).toBeInTheDocument();
    expect(panel.getByText('$60.00')).toBeInTheDocument();
  });

  it('says where the service fee appears and never totals one before payment', () => {
    renderPanel();
    expect(
      aside().getByText('Service fee shown at payment, only when paying by card.')
    ).toBeInTheDocument();
    expect(aside().queryByText('Total due')).not.toBeInTheDocument();
  });

  it('lists a selected dog with no classes and a $0.00 total', () => {
    renderPanel({
      groups: groupCartByDogAndDay([], dogs, panelClasses(1), trials, ['dog-1', 'dog-2']),
    });
    expect(aside().getAllByText('No classes yet')).toHaveLength(2);
    expect(aside().getByText('0 classes')).toBeInTheDocument();
    expect(aside().getByText('$0.00')).toBeInTheDocument();
  });

  it('shows the total once per rendering, not twice', () => {
    renderPanel();
    expect(aside().getAllByText('Entry fees')).toHaveLength(1);
  });
});

describe('EntriesPanel phone bar', () => {
  it('reads "N classes · $X" and carries the wizard navigation', () => {
    render(<EntriesPanel groups={groupsFor(5)} navigation={<button type="button">Next</button>} />);
    const bar = within(screen.getByTestId('entries-panel-bar'));
    expect(bar.getByTestId('entries-panel-total')).toHaveTextContent('5 classes · $150.00');
    expect(bar.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('expands the itemised list from the Details control', async () => {
    const { user } = render(<EntriesPanel groups={groupsFor(2)} />);
    const bar = within(screen.getByTestId('entries-panel-bar'));
    expect(screen.queryByTestId('entries-panel-details-list')).not.toBeInTheDocument();

    const details = bar.getByTestId('entries-panel-details');
    expect(details).toHaveAttribute('aria-expanded', 'false');
    await user.click(details);

    expect(details).toHaveAttribute('aria-expanded', 'true');
    const list = within(screen.getByTestId('entries-panel-details-list'));
    expect(list.getAllByTestId('entries-panel-line')).toHaveLength(2);
    expect(list.getByText('Rover')).toBeInTheDocument();
  });

  it('sticks to the bottom of the wizard scrollport instead of fixing to the viewport', () => {
    render(<EntriesPanel groups={groupsFor(1)} />);
    const bar = screen.getByTestId('entries-panel-bar');
    // jsdom lays nothing out; the rendered proof is wizardVisualQA's containment
    // assertion. This pins the positioning mode so a regression to `fixed`
    // (which escapes the main area and covers the sidebar at tablet widths)
    // cannot slip in silently.
    expect(bar).toHaveClass('sticky');
    expect(bar).not.toHaveClass('fixed');
    expect(
      document.documentElement.style.getPropertyValue('--registration-bottom-bar-height')
    ).toBe('');
  });
});

describe('EntriesPanel fee-line removal (payment step)', () => {
  it('keeps the remove control at the 44px touch-target floor', () => {
    render(paymentPanel({ onRemoveLine: vi.fn() }));
    expect(aside().getByRole('button', { name: 'Remove Container Level 0' })).toHaveClass(
      'min-h-11'
    );
  });

  it('asks before removing, naming the class', async () => {
    const onRemoveLine = vi.fn();
    const { user } = render(
      paymentPanel({ groups: groupsFor(2), feeCalculation: fees(2), onRemoveLine })
    );
    await user.click(aside().getByRole('button', { name: 'Remove Container Level 1' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText('Remove Container Level 1 from this entry?')
    ).toBeInTheDocument();
    // Nothing has left the entry yet.
    expect(onRemoveLine).not.toHaveBeenCalled();
  });

  it('leaves the line and the total unchanged when the confirmation is cancelled', async () => {
    const onRemoveLine = vi.fn();
    const { user } = render(
      paymentPanel({ groups: groupsFor(2), feeCalculation: fees(2), onRemoveLine })
    );
    const totalDue = () => aside().getByText('Total due').parentElement?.textContent;
    const totalBefore = totalDue();

    await user.click(aside().getByRole('button', { name: 'Remove Container Level 1' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(onRemoveLine).not.toHaveBeenCalled();
    expect(aside().getAllByTestId('entries-panel-line')).toHaveLength(2);
    expect(totalDue()).toBe(totalBefore);
  });

  it('removes the line the button belongs to once the removal is confirmed', async () => {
    const onRemoveLine = vi.fn();
    const { user } = render(
      paymentPanel({ groups: groupsFor(2), feeCalculation: fees(2), onRemoveLine })
    );
    await user.click(aside().getByRole('button', { name: 'Remove Container Level 1' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    // The SAME arguments the trash button used to pass straight through.
    expect(onRemoveLine).toHaveBeenCalledTimes(1);
    expect(onRemoveLine).toHaveBeenCalledWith('dog-1', 'class-1');
  });

  it('disables only the line currently being removed', () => {
    render(
      paymentPanel({
        groups: groupsFor(2),
        feeCalculation: fees(2),
        onRemoveLine: vi.fn(),
        removingLineKey: 'dog-1:class-0',
      })
    );
    expect(aside().getByRole('button', { name: 'Remove Container Level 0' })).toBeDisabled();
    expect(aside().getByRole('button', { name: 'Remove Container Level 1' })).toBeEnabled();
  });

  it('marks a wait-list class as not payable now', () => {
    render(
      paymentPanel({
        feeCalculation: fees(1, true),
        waitlistClassIds: new Set(['class-0']),
      })
    );
    expect(aside().getByText('(Wait list request)')).toBeInTheDocument();
    expect(aside().getByText('No payment due')).toBeInTheDocument();
  });
});

/**
 * The phone bar and the Details block are the SAME numbers at two widths. A
 * headline that formats `amountDueCents` unconditionally disagrees with the
 * totals block the moment money is not a plain figure — waived, or a capacity
 * that has not resolved (Codex #2210 P2).
 */
describe('EntriesPanel bar headline agrees with the totals block', () => {
  function bar() {
    return within(screen.getByTestId('entries-panel-bar'));
  }

  it('quotes the waived entry as waived, not as the full fee', () => {
    render(paymentPanel({ waiveFees: true }));
    expect(bar().getByTestId('entries-panel-total')).toHaveTextContent('$0.00 (Waived)');
    expect(bar().getByTestId('entries-panel-total')).not.toHaveTextContent('$30.00');
  });

  it('quotes the waived payment method as waived', () => {
    render(paymentPanel({ paymentMethod: 'waived' as PaymentMethod }));
    expect(bar().getByTestId('entries-panel-total')).toHaveTextContent('$0.00 (Waived)');
  });

  it('shows the availability placeholder rather than a figure while capacity is unread', () => {
    render(paymentPanel({ capacityReady: false }));
    expect(bar().getByTestId('entries-panel-total')).toHaveTextContent('Checking availability');
  });

  it('says "Not confirmed" in the bar when availability could not be read', () => {
    render(paymentPanel({ capacityReady: false, capacityUnavailable: true }));
    expect(bar().getByTestId('entries-panel-total')).toHaveTextContent('Not confirmed');
  });

  it('still shows entry fees in the bar before the payment step', () => {
    render(<EntriesPanel groups={groupsFor(1)} />);
    expect(bar().getByTestId('entries-panel-total')).toHaveTextContent('$30.00');
  });

  it('placeholders the pre-payment bar too while capacity is unread', () => {
    render(<EntriesPanel groups={groupsFor(1)} capacityReady={false} />);
    expect(bar().getByTestId('entries-panel-total')).toHaveTextContent('Checking availability');
  });
  it('reads $0.00, not a placeholder, when nothing is selected yet', () => {
    // Dog-selection step: availability is genuinely unread, but an empty cart
    // costs $0.00 no matter how it resolves. "Checking availability" against no
    // classes reads as though a number were being withheld (Codex #2210 P2).
    render(<EntriesPanel groups={groupsFor(0)} capacityReady={false} />);
    expect(bar().getByTestId('entries-panel-total')).toHaveTextContent('$0.00');
    expect(bar().getByTestId('entries-panel-total')).not.toHaveTextContent('Checking availability');
  });

  it('reads $0.00 on the payment step too when the entry is empty', () => {
    render(paymentPanel({ groups: groupsFor(0), feeCalculation: fees(0), capacityReady: false }));
    expect(bar().getByTestId('entries-panel-total')).toHaveTextContent('$0.00');
  });

  it('still placeholders once there IS a class whose availability is unread', () => {
    render(<EntriesPanel groups={groupsFor(1)} capacityReady={false} />);
    expect(bar().getByTestId('entries-panel-total')).toHaveTextContent('Checking availability');
  });
});

/**
 * A staff fee override replaced `totals.entryFeeCents` wholesale, so "Entry
 * fees" and "Subtotal" quoted the override while the lines above them still
 * itemised the real classes — $30.00 claimed over two visible $25.00 rows
 * (Codex #2210 round 6 P2). The itemised sum is now what those rows say, and
 * the difference is named.
 */
describe('EntriesPanel reconciles a staff fee override with the lines', () => {
  function overridePanel(feeOverride: number | null, paymentMethod: PaymentMethod = 'check') {
    return paymentPanel({
      groups: groupsFor(2),
      feeCalculation: fees(2),
      paymentMethod,
      feeOverride,
    });
  }

  it('keeps Entry fees and Subtotal as the sum of the lines actually shown', () => {
    render(overridePanel(30));
    const panel = aside();

    // Two lines at $30 each — this fixture's class fee — against a $30
    // override. The rows must read the LINES, not the override.
    expect(panel.getByText('Entry fees').parentElement).toHaveTextContent('$60.00');
    expect(panel.getByText('Subtotal').parentElement).toHaveTextContent('$60.00');
  });

  it('names the difference as a Secretary adjustment', () => {
    render(overridePanel(30));
    const panel = aside();

    const row = panel.getByText('Secretary adjustment').parentElement;
    expect(row).toHaveTextContent('-$30.00');
  });

  it('still quotes the override as the amount due', () => {
    render(overridePanel(30));
    expect(aside().getByText('Total due').parentElement).toHaveTextContent('$30.00');
  });

  it('shows a positive adjustment when the override is higher', () => {
    render(overridePanel(80));
    expect(aside().getByText('Secretary adjustment').parentElement).toHaveTextContent('+$20.00');
  });

  it('adds no adjustment row when there is no override', () => {
    render(overridePanel(null));
    expect(aside().queryByText('Secretary adjustment')).not.toBeInTheDocument();
    expect(aside().getByText('Entry fees').parentElement).toHaveTextContent('$60.00');
  });

  it('adds no adjustment row when the override equals the itemised sum', () => {
    render(overridePanel(60));
    expect(aside().queryByText('Secretary adjustment')).not.toBeInTheDocument();
  });
});
