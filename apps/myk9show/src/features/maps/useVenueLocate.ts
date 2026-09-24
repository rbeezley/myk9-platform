import { useCallback, useEffect, useRef, useState } from 'react';
import { geocodeAddress, type GeocodeResult } from './geocode';
import { normalizePinValue, type VenuePinValue } from './normalizePinValue';

type LocateFailure = Exclude<GeocodeResult['status'], 'found'>;

export interface VenueLocateNoticeValue {
  kind: LocateFailure;
  message: string;
  /** True when the same lookup may succeed if simply repeated. */
  canRetry: boolean;
}

const MANUAL = 'or click the map to place the pin yourself.';

/** MYK9-686: each failure says what happened and what to do next. */
const NOTICES: Record<LocateFailure, VenueLocateNoticeValue> = {
  not_found: {
    kind: 'not_found',
    message: `We couldn't find that address on the map. Check the street, city and ZIP and locate again, ${MANUAL}`,
    canRetry: false,
  },
  invalid: {
    kind: 'invalid',
    message: `Enter a street address with city and state to locate it, ${MANUAL}`,
    canRetry: false,
  },
  unavailable: {
    kind: 'unavailable',
    message: `The map search isn't responding right now. Try again, ${MANUAL}`,
    canRetry: true,
  },
};

interface UseVenueLocateOptions {
  address: string;
  value: VenuePinValue | null;
  onLocated: (pin: VenuePinValue) => void;
}

/**
 * The "Locate address" action for the venue pin map. The address is handed to
 * the geocoder unchanged — it normalizes a query copy — and a result that
 * arrives after the pin was placed by hand or the address was edited is dropped.
 */
export function useVenueLocate({ address, value, onLocated }: UseVenueLocateOptions) {
  const [isLocating, setIsLocating] = useState(false);
  const [notice, setNotice] = useState<VenueLocateNoticeValue | null>(null);

  const latestValueRef = useRef<VenuePinValue | null>(value);
  const latestAddressRef = useRef(address);
  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);
  useEffect(() => {
    latestAddressRef.current = address;
  }, [address]);

  const locate = useCallback(async () => {
    setNotice(null);
    setIsLocating(true);
    const valueAtRequest = latestValueRef.current;
    const addressAtRequest = address;
    const result = await geocodeAddress(address);
    setIsLocating(false);
    if (latestValueRef.current !== valueAtRequest) return;
    if (latestAddressRef.current !== addressAtRequest) return;
    if (result.status === 'found') {
      onLocated(normalizePinValue(result.lat, result.lng));
    } else {
      setNotice(NOTICES[result.status]);
    }
  }, [address, onLocated]);

  const clearNotice = useCallback(() => setNotice(null), []);

  return { isLocating, notice, locate, clearNotice };
}
