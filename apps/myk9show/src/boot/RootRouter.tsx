import { useCallback, useEffect, useRef, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { ErrorState } from '@/components/common/ErrorState';
import { PageLoadingFallback } from '@/components/common/PageLoadingFallback';
import { logger } from '@/services/LoggingService';
import { importWithRetry } from '@/utils/lazyWithRetry';
import { recoverFromChunkLoadError } from '@/utils/chunkLoadRecovery';
import { GuestLanding, type AppRouter } from './GuestLanding';

const currentUrl = () => window.location.pathname + window.location.search + window.location.hash;

/** How long a guest's page may sit idle before the full app is fetched in the background. */
const GUEST_PRELOAD_IDLE_TIMEOUT_MS = 4_000;
/** The same wait where the browser has no idle callback. */
const GUEST_PRELOAD_FALLBACK_DELAY_MS = 1_000;

/**
 * The top of the route tree (MYK9-2140). The full app (`../router`, with the signed-in shell and
 * every route) is its own file. A first-time visitor on `/` (`guestBoot`) gets the light landing
 * page at once and the full app is fetched when the browser is idle; everyone else waits for the
 * full app, as before. When a guest follows a link off the landing page, the full app takes over
 * at that URL.
 */
export function RootRouter({
  guestBoot,
  onRouter,
}: {
  guestBoot: boolean;
  onRouter: (router: AppRouter) => void;
}) {
  const [guest, setGuest] = useState(guestBoot);
  const [appRouter, setAppRouter] = useState<AppRouter | null>(null);
  const [failed, setFailed] = useState(false);
  const loading = useRef<Promise<AppRouter | { failure: unknown }> | null>(null);
  const guestRouter = useRef<AppRouter | null>(null);

  // One fetch at a time, shared by the guest's background fetch and the page's own. A failure
  // is handed to whoever is waiting, and the next call starts a new attempt.
  const loadAppRouter = useCallback((): Promise<AppRouter | { failure: unknown }> => {
    loading.current ??= importWithRetry(() => import('../router'))
      .then(module => module.router)
      .catch((failure: unknown) => {
        loading.current = null;
        return { failure };
      });
    return loading.current;
  }, []);

  // Not a guest: the full app is the page, so fetch it now and show it.
  // A guest: only fetch it, once the landing page has loaded and the browser is idle.
  useEffect(() => {
    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      void loadAppRouter().then(async router => {
        if (cancelled || guest) return;
        if ('failure' in router) {
          // A guest's background fetch failing is not the guest's problem: they are reading the
          // landing page, perhaps typing in its form, so it must neither reload nor report.
          // Here the app IS the page. A reload is earned only when it can fix a stale build;
          // otherwise say so and offer one. Report it either way: the app did not start, and
          // while the router was part of the startup file the browser reported that by itself.
          const { failure } = router;
          logger.error(
            'The app file failed to load',
            'boot',
            { data: { url: currentUrl(), failure: String(failure) } },
            failure instanceof Error ? failure : undefined
          );
          if (!recoverFromChunkLoadError(failure)) setFailed(true);
          return;
        }
        // The full app's router was created while the URL was `/`. A guest who followed a link
        // moved the URL through the landing page's own router, so bring the full app to it.
        const { pathname, search, hash } = router.state.location;
        if (pathname + search + hash !== currentUrl()) {
          await router.navigate(currentUrl(), { replace: true });
        }
        if (cancelled) return;
        // The landing page's router is done: stop it listening to Back and Forward.
        guestRouter.current?.dispose();
        guestRouter.current = null;
        setAppRouter(router);
        onRouter(router);
      });
    };
    const whenIdle = () => {
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(start, { timeout: GUEST_PRELOAD_IDLE_TIMEOUT_MS });
      } else {
        timeoutId = setTimeout(start, GUEST_PRELOAD_FALLBACK_DELAY_MS);
      }
    };
    if (!guest) start();
    else if (document.readyState === 'complete') whenIdle();
    else window.addEventListener('load', whenIdle, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', whenIdle);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [guest, loadAppRouter, onRouter]);

  const leaveGuestLanding = useCallback(() => setGuest(false), []);
  const trackGuestRouter = useCallback(
    (router: AppRouter) => {
      guestRouter.current = router;
      onRouter(router);
    },
    [onRouter]
  );

  if (guest) return <GuestLanding onLeave={leaveGuestLanding} onRouter={trackGuestRouter} />;
  if (appRouter) return <RouterProvider router={appRouter} />;
  if (failed) {
    return (
      <ErrorState
        message="myK9Show could not finish loading"
        headingLevel={1}
        onRetry={() => window.location.reload()}
      />
    );
  }
  return <PageLoadingFallback />;
}
