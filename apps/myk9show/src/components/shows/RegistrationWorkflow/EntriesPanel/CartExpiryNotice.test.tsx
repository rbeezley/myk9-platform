import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { CartExpiryNotice } from './CartExpiryNotice';
import { useCartStore, type CartWithDetails } from '@/store/cartStore';

/**
 * Seeds the store the way the wizard's own selectors read it: an `expires_at`
 * the getters derive from, plus the `expirationWarning` flag `loadCart` sets.
 */
function seedCart(expiresInMs: number, expirationWarning: boolean) {
  const cart = {
    id: 'cart-1',
    show_id: 'show-1',
    exhibitor_id: 'exhibitor-1',
    status: 'active',
    expires_at: new Date(Date.now() + expiresInMs).toISOString(),
    subtotal_cents: 3000,
    platform_fee_cents: 210,
    total_cents: 3210,
    items: [],
  } as unknown as CartWithDetails;
  useCartStore.setState({ cart, expirationWarning });
}

// The cart store is a module singleton shared with every other test file, so
// it is reset on BOTH edges. O(1): `reset` drops the cart reference whole rather
// than walking its items.
beforeEach(() => {
  useCartStore.getState().reset();
});

afterEach(() => {
  useCartStore.getState().reset();
});

/** The wizard's own identity — matches `seedCart`'s cart by default. */
const OWNER = { showId: 'show-1', exhibitorId: 'exhibitor-1' } as const;

describe('CartExpiryNotice', () => {
  it('says nothing while the cart is comfortably alive', () => {
    seedCart(20 * 60 * 1000, false);
    render(<CartExpiryNotice {...OWNER} />);
    expect(screen.queryByTestId('cart-expiry-notice')).not.toBeInTheDocument();
  });

  it('announces the minutes remaining inside the warning window', () => {
    seedCart(4 * 60 * 1000 + 30_000, true);
    render(<CartExpiryNotice {...OWNER} />);

    const notice = screen.getByTestId('cart-expiry-notice');
    expect(notice).toHaveAttribute('role', 'status');
    // A part-minute rounds up, so 4m30s is "5 minutes left".
    expect(notice).toHaveTextContent('5 minutes left to finish');
    expect(notice).toHaveTextContent(/selections are released/);
  });

  it('says "1 minute" in the singular on the last minute', () => {
    seedCart(30_000, true);
    render(<CartExpiryNotice {...OWNER} />);
    expect(screen.getByTestId('cart-expiry-notice')).toHaveTextContent('1 minute left to finish');
  });

  it('states that the selections expired rather than showing nothing', () => {
    seedCart(-60_000, true);
    render(<CartExpiryNotice {...OWNER} />);

    const notice = screen.getByTestId('cart-expiry-notice');
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveTextContent('Your selections expired');
    expect(notice).toHaveTextContent(/nothing has been entered or charged/);
    expect(notice).not.toHaveTextContent(/left to finish/);
  });

  it('shows nothing when there is no cart at all', () => {
    render(<CartExpiryNotice {...OWNER} />);
    expect(screen.queryByTestId('cart-expiry-notice')).not.toBeInTheDocument();
  });
});

describe('CartExpiryNotice recovery control', () => {
  it('offers Start again on the expired branch, at the 44px touch floor', () => {
    seedCart(-60_000, true);
    render(<CartExpiryNotice {...OWNER} reload={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Start again' });
    expect(button).toHaveClass('min-h-11');
  });

  it('reloads the wizard when Start again is pressed', async () => {
    // A reload, not a state reset: `loadCart` filters `expires_at > now`, the
    // wizard's selections and completion are React state, and the dead cart
    // needs no `abandonCart`. Four hand-built resets each raced the cart
    // lifecycle; a fresh boot has no ordering to get wrong.
    const reload = vi.fn();
    seedCart(-60_000, true);
    const { user } = render(<CartExpiryNotice {...OWNER} reload={reload} />);

    await user.click(screen.getByRole('button', { name: 'Start again' }));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('offers no recovery control while the cart is merely expiring', () => {
    seedCart(2 * 60 * 1000, true);
    render(<CartExpiryNotice {...OWNER} reload={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Start again' })).not.toBeInTheDocument();
  });
});

/**
 * `cartStore` has no clock: `expirationWarning` is set once at load and
 * `getTimeUntilExpiration()` is a plain getter. The countdown therefore has to
 * be driven from here, and these are the tests that would catch it going back
 * to a number frozen at mount.
 */
describe('CartExpiryNotice keeps its own time', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts the remaining minutes down as time passes', async () => {
    seedCart(3 * 60 * 1000, true);
    render(<CartExpiryNotice {...OWNER} />);
    expect(screen.getByTestId('cart-expiry-notice')).toHaveTextContent('3 minutes left');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });
    expect(screen.getByTestId('cart-expiry-notice')).toHaveTextContent('2 minutes left');
  });

  it('announces a cart that crosses into the warning window while the wizard is open', async () => {
    // The store's flag is still false — this is the case it cannot cover.
    seedCart(5 * 60 * 1000 + 30_000, false);
    render(<CartExpiryNotice {...OWNER} />);
    expect(screen.queryByTestId('cart-expiry-notice')).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByTestId('cart-expiry-notice')).toHaveTextContent(/left to finish/);
  });

  it('switches to the expired branch when the cart lapses while on screen', async () => {
    seedCart(60_000, true);
    render(<CartExpiryNotice {...OWNER} />);
    expect(screen.getByTestId('cart-expiry-notice')).toHaveTextContent('1 minute left');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    });
    expect(screen.getByTestId('cart-expiry-notice')).toHaveTextContent('Your selections expired');
  });

  it('runs no timer when there is no cart to count down', () => {
    render(<CartExpiryNotice {...OWNER} />);
    expect(vi.getTimerCount()).toBe(0);
  });
});

/**
 * The cart store is a singleton: a wizard opened on the dog step can find it
 * still holding an expired cart from a PREVIOUS show, and announcing that as
 * this registration's expiry is a lie about the exhibitor's own work
 * (Codex #2210 P1).
 */
describe('CartExpiryNotice only speaks for this registration', () => {
  it('says nothing about an expired cart left over from another show', () => {
    seedCart(-60_000, true);
    render(<CartExpiryNotice showId="show-2" exhibitorId="exhibitor-1" />);
    expect(screen.queryByTestId('cart-expiry-notice')).not.toBeInTheDocument();
  });

  it("says nothing about another exhibitor's cart in a staff flow", () => {
    seedCart(-60_000, true);
    render(<CartExpiryNotice showId="show-1" exhibitorId="exhibitor-2" />);
    expect(screen.queryByTestId('cart-expiry-notice')).not.toBeInTheDocument();
  });

  it("says nothing about another show's cart that is merely expiring", () => {
    seedCart(2 * 60 * 1000, true);
    render(<CartExpiryNotice showId="show-2" exhibitorId="exhibitor-1" />);
    expect(screen.queryByTestId('cart-expiry-notice')).not.toBeInTheDocument();
  });

  it('stays silent until the wizard has resolved its own identity', () => {
    seedCart(-60_000, true);
    render(<CartExpiryNotice />);
    expect(screen.queryByTestId('cart-expiry-notice')).not.toBeInTheDocument();
  });
});
