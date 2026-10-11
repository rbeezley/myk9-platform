/**
 * useElementMaxTimeStatus — the 30-second warning, "Time Expired" and remaining
 * time for a UKC dual-timer class, measured on the ELEMENT clock.
 *
 * In Superior / Master / Elite the rulebook maximum is an element time: the
 * element clock runs continuously while the search clock pauses at each alert,
 * so a warning keyed on search time would come late (MYK9-1093). Warns at <= 30s
 * remaining, chiming and announcing once per run. Unlike AKC (useStopwatch skips
 * Master), the UKC rulebook gives the element 30-second warning in all classes.
 */

import { useEffect, useRef } from 'react';

export interface ElementMaxTimeStatusOptions {
  /** Whether this class times the element (dual mode). When false, inert. */
  enabled: boolean;
  maxTimeMs: number;
  elementTimeMs: number;
  isRunning: boolean;
  enableVoiceAnnouncements?: boolean | undefined;
  onWarningChime?: (() => void) | undefined;
  onVoiceAnnouncement?: ((secondsRemaining: number) => void) | undefined;
}

export interface ElementMaxTimeStatus {
  remainingMs: number;
  isWarning: boolean;
  isExpired: boolean;
  warningMessage: string | null;
}

export function useElementMaxTimeStatus({
  enabled,
  maxTimeMs,
  elementTimeMs,
  isRunning,
  enableVoiceAnnouncements = false,
  onWarningChime,
  onVoiceAnnouncement,
}: ElementMaxTimeStatusOptions): ElementMaxTimeStatus {
  const active = enabled && maxTimeMs > 0;
  const remainingMs = active ? Math.max(0, maxTimeMs - elementTimeMs) : 0;
  const isExpired = active && elementTimeMs > 0 && elementTimeMs >= maxTimeMs;
  const isWarning = active && isRunning && remainingMs > 0 && remainingMs <= 30_000;

  // Once per run: a reset (element time back to 0) re-arms it.
  const announcedRef = useRef(false);
  useEffect(() => {
    if (elementTimeMs === 0) announcedRef.current = false;
    if (!isWarning || announcedRef.current) return;
    announcedRef.current = true;
    onWarningChime?.();
    if (enableVoiceAnnouncements) onVoiceAnnouncement?.(30);
  }, [isWarning, elementTimeMs, enableVoiceAnnouncements, onWarningChime, onVoiceAnnouncement]);

  const warningMessage = isExpired ? 'Time Expired' : isWarning ? '30 Second Warning' : null;
  return { remainingMs, isWarning, isExpired, warningMessage };
}
