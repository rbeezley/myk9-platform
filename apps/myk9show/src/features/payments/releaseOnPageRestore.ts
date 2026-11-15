/**
 * Run `release` if the browser restores this page from its back/forward cache.
 *
 * A Pay button stays busy while the browser leaves for Stripe (MYK9-1964), so a
 * second press cannot start a second checkout. Back from Stripe can bring the
 * page back exactly as it was left, busy button and all, with no reload to
 * reset it; this frees it then. A real reload starts fresh anyway.
 */
export function releaseOnPageRestore(release: () => void): void {
  if (typeof window === 'undefined') return;
  const onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    window.removeEventListener('pageshow', onPageShow);
    release();
  };
  window.addEventListener('pageshow', onPageShow);
}
