/**
 * Sonner, docked bottom-right, lifted clear of whatever action bar is mounted.
 *
 * Two defects from the 2026-07-24 exhibitor audit are addressed here, and they
 * are separate problems that happened to combine into one data loss:
 *
 *   1. The toast sat ON the bottom-right primary control, so a tap intended for
 *      "Save Changes" hit the toast instead.
 *   2. The toast was stale — a CTA from an earlier screen was still on-screen
 *      and still clickable, so the mis-hit navigated somewhere unrelated.
 *
 * Fixing only (1) leaves a stale CTA hoverable over live content; fixing only
 * (2) leaves the next toast covering the button. Both are handled below.
 *
 * The bottom-right dock itself stays: `<ToastContainer />` owns the top-right
 * corner and `test/mainToasterDocking.source.test.ts` pins sonner away from it.
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { useActionBarStore, selectReservedBottom } from '@/store/actionBarStore';

/** Clearance between the toast stack and the action bar beneath it. */
const TOAST_GAP_PX = 12;

export function AppToaster() {
  const reservedBottom = useActionBarStore(selectReservedBottom);
  const { pathname } = useLocation();
  const firstRender = useRef(true);

  useEffect(() => {
    // Don't wipe a toast raised during the initial render of the landing route
    // — this effect runs once on mount before any navigation has happened.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // A toast describes something that happened on the screen you were on.
    // Once you leave, its CTA points somewhere the message no longer explains,
    // and it is still clickable. Clear on navigation.
    toast.dismiss();
  }, [pathname]);

  const bottom =
    reservedBottom > 0
      ? `calc(max(1rem, env(safe-area-inset-bottom)) + ${reservedBottom + TOAST_GAP_PX}px)`
      : 'max(1rem, env(safe-area-inset-bottom))';

  const offset = {
    right: 'max(1rem, env(safe-area-inset-right))',
    bottom,
  };

  return (
    <Toaster
      theme="system"
      richColors
      closeButton
      position="bottom-right"
      offset={offset}
      mobileOffset={offset}
    />
  );
}
