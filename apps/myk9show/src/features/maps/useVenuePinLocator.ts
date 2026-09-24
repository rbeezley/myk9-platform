import { useCallback, useRef, useState } from 'react';
import { useVenueLocate } from './useVenueLocate';
import type { VenuePinValue } from './normalizePinValue';

export interface VenueFlyTarget extends VenuePinValue {
  /** Distinguishes successive geocodes to the same coordinates. */
  nonce: number;
}

interface UseVenuePinLocatorOptions {
  address: string;
  value: VenuePinValue | null;
  onChange: (value: VenuePinValue) => void;
}

/**
 * Everything the venue pin map needs to place a pin: the geocoding locate, the
 * fly-to target a located pin re-centers on, and the manual placement that
 * answers a failed locate. It lives outside the map so a form can own it and
 * trigger the SAME locate itself (MYK9-686 auto-locate on blur) — there is one
 * geocode path, whether the button or the address field starts it.
 */
export function useVenuePinLocator({ address, value, onChange }: UseVenuePinLocatorOptions) {
  const [flyTarget, setFlyTarget] = useState<VenueFlyTarget | null>(null);

  const handleLocated = useCallback(
    (pin: VenuePinValue) => {
      onChange(pin);
      setFlyTarget({ ...pin, nonce: Date.now() });
    },
    [onChange]
  );
  const { isLocating, notice, locate, clearNotice } = useVenueLocate({
    address,
    value,
    onLocated: handleLocated,
  });

  // A pin placed by hand answers the failure notice (MYK9-686 manual fallback).
  const placeManually = useCallback(
    (pin: VenuePinValue) => {
      clearNotice();
      onChange(pin);
    },
    [clearNotice, onChange]
  );

  return { isLocating, notice, locate, flyTarget, placeManually };
}

export type VenuePinLocator = ReturnType<typeof useVenuePinLocator>;

/**
 * MYK9-686: leaving the address field with text and no pin runs the locate the
 * "Locate address" button runs, so a typed address is never saved pinless in
 * silence. Once per distinct address — Nominatim's usage policy forbids
 * per-keystroke lookups, and a failed address is retried with the button, not
 * by focusing and leaving again. The locate's own guard drops a result that
 * arrives after the address changed or a pin was placed by hand.
 */
export function useVenueAutoLocate({
  address,
  hasPin,
  locator,
}: {
  address: string;
  hasPin: boolean;
  locator: Pick<VenuePinLocator, 'locate'>;
}) {
  const lastAttemptRef = useRef<string | null>(null);
  const { locate } = locator;

  // No in-flight check here: a newer address supersedes an older lookup, and
  // the locate itself ignores a repeat of the address it is already locating.
  return useCallback(() => {
    const key = address.trim();
    if (!key || hasPin || lastAttemptRef.current === key) return;
    lastAttemptRef.current = key;
    void locate();
  }, [address, hasPin, locate]);
}
