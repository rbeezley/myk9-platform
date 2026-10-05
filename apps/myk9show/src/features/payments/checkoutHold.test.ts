import { afterEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '@/constants/storageKeys';
import {
  CHECKOUT_HOLD_ENDED_MESSAGE,
  CHECKOUT_HOLD_PAY_LINE,
  checkoutHoldEnded,
  rememberCheckoutHold,
} from './checkoutHold';

const ENDS = '2026-10-05T01:00:00.000Z';
const ENDS_MS = Date.parse(ENDS);

afterEach(() => {
  sessionStorage.clear();
});

describe('the owner-approved hold copy', () => {
  it('says the spots are held for 30 minutes at Pay', () => {
    expect(CHECKOUT_HOLD_PAY_LINE).toBe("We're holding your spots for 30 minutes while you pay.");
  });

  it('says the cart is saved and spots are re-checked when the hold ends', () => {
    expect(CHECKOUT_HOLD_ENDED_MESSAGE).toBe(
      'Your 30-minute hold ended. Your cart is saved; check out again to re-check spots.'
    );
  });
});

describe('checkoutHoldEnded', () => {
  it('is false with no remembered hold', () => {
    expect(checkoutHoldEnded(ENDS_MS + 1)).toBe(false);
  });

  it('is false while the hold lives and true from the instant it ends', () => {
    rememberCheckoutHold('cs_1', ENDS);
    expect(checkoutHoldEnded(ENDS_MS - 1)).toBe(false);
    expect(checkoutHoldEnded(ENDS_MS)).toBe(true);
  });

  it('only answers for the page it was told about when given a session id', () => {
    rememberCheckoutHold('cs_1', ENDS);
    expect(checkoutHoldEnded(ENDS_MS + 1, 'cs_1')).toBe(true);
    expect(checkoutHoldEnded(ENDS_MS + 1, 'cs_other')).toBe(false);
  });

  it('keeps the newest page: a second Pay replaces the first hold', () => {
    rememberCheckoutHold('cs_1', ENDS);
    rememberCheckoutHold('cs_2', '2026-10-05T02:00:00.000Z');
    expect(checkoutHoldEnded(ENDS_MS + 1)).toBe(false);
  });

  it('ignores a missing or unreadable expiry', () => {
    rememberCheckoutHold('cs_1', undefined);
    expect(sessionStorage.getItem(STORAGE_KEYS.CHECKOUT_HOLD)).toBeNull();
    rememberCheckoutHold('cs_1', 'not a date');
    expect(sessionStorage.getItem(STORAGE_KEYS.CHECKOUT_HOLD)).toBeNull();
    sessionStorage.setItem(STORAGE_KEYS.CHECKOUT_HOLD, '{broken');
    expect(checkoutHoldEnded(ENDS_MS + 1)).toBe(false);
  });
});
