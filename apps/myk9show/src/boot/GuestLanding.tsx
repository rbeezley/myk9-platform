import { useEffect, useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Home from '@/pages/Home';
import { AuthContext } from '@/context/authContextObject';
import { PageLoadingFallback } from '@/components/common/PageLoadingFallback';
import { GUEST_AUTH_VALUE } from './guestAuthValue';

/** The visitor is leaving the light landing page: hand over to the full app. */
function LeaveGuestLanding({ onLeave }: { onLeave: () => void }) {
  useEffect(() => {
    onLeave();
  }, [onLeave]);
  return <PageLoadingFallback />;
}

/** A data router: the landing page's own, or the full app's. */
export type AppRouter = ReturnType<typeof createBrowserRouter>;

/**
 * The landing page for a visitor with no session, without the signed-in app shell (MYK9-2140).
 * It has its own two-route router: `/` is the landing page, and anything else means the visitor
 * followed a link off it. Either that or a crash on the page calls `onLeave`, so the caller can
 * show the full app at the current URL (which renders `/` as it always has).
 *
 * No "Install myK9Show" banner here, by the owner's decision (2026-11-17): it would bring the
 * database client and a dialog into every guest's first load. `installPromptCapture` keeps the
 * browser's offer, so the app shell's banner shows as soon as the visitor signs in or opens any
 * other page.
 */
export function GuestLanding({
  onLeave,
  onRouter,
}: {
  onLeave: () => void;
  onRouter: (router: AppRouter) => void;
}) {
  const [router] = useState(() => {
    const leave = <LeaveGuestLanding onLeave={onLeave} />;
    return createBrowserRouter([
      { path: '/', element: <Home />, errorElement: leave },
      { path: '*', element: leave },
    ]);
  });

  useEffect(() => {
    onRouter(router);
  }, [onRouter, router]);

  return (
    <AuthContext.Provider value={GUEST_AUTH_VALUE}>
      <RouterProvider router={router} />
    </AuthContext.Provider>
  );
}
