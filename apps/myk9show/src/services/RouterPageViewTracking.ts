interface RouterLocationState {
  location: {
    key: string;
  };
}

interface RouterNavigationSource<TState extends RouterLocationState> {
  state: TState;
  subscribe: (listener: (state: TState) => void) => () => void;
}

interface PageViewTracker {
  trackPageView: () => void;
}

/**
 * Connects the data router's navigation lifecycle to page-view analytics.
 *
 * React Router's pushState/replaceState transitions do not emit popstate, so
 * listening to the browser event alone misses normal in-app navigation. The
 * router supplies a unique location key for each navigation; using it also
 * prevents revalidation updates from creating duplicate page views.
 */
export function setupRouterPageViewTracking<TState extends RouterLocationState>(
  router: RouterNavigationSource<TState>,
  analytics: PageViewTracker
): () => void {
  let lastLocationKey = router.state.location.key;

  return router.subscribe(state => {
    const nextLocationKey = state.location.key;
    if (nextLocationKey === lastLocationKey) return;

    lastLocationKey = nextLocationKey;
    analytics.trackPageView();
  });
}
