import { useEffect, type ReactNode } from 'react';
import { useAnnouncementStore } from '@/store/announcementStore';

/**
 * Keeps the current show's announcements live on the ringside `/at-show` surface
 * (J5.4 / R1), and renders nothing of its own.
 *
 * Ringside is mounted outside `UnifiedAppLayout`, so nothing else subscribes the
 * announcement store to this show. The subscription feeds the ringside menu's
 * unread badge and its Announcements item, which opens the Message Center over
 * the screen (MYK9-1508).
 *
 * INTENT (MYK9-1697, owner decision D1, 2026-11-04): there is deliberately no
 * announcements bar here. It used to pin a second, inline copy of the same feed
 * above every ringside screen, the scoresheet included: 45px of a phone, noise
 * over a calm scoring screen, and it covered the entry list's Up button while
 * the list scrolled. Announcements have one home, the menu. Do not add the bar back.
 *
 * Anon ringside-passcode sessions are Supabase anonymous-auth sessions
 * (Postgres role `authenticated`, non-null auth.uid()). Their server-stamped,
 * generation-aware claim admits only announcements for the claimed show;
 * ordinary anonymous sessions remain denied. See
 * atShowAnnouncementReadAuthzContract.test.ts.
 */
export function AtShowAnnouncementSubscription({
  showId,
  children,
}: {
  showId: string | undefined;
  children: ReactNode;
}) {
  const subscribe = useAnnouncementStore(state => state.subscribe);
  const unsubscribe = useAnnouncementStore(state => state.unsubscribe);

  useEffect(() => {
    if (!showId) return;
    void subscribe([showId]);
    return () => unsubscribe();
  }, [showId, subscribe, unsubscribe]);

  return <>{children}</>;
}
