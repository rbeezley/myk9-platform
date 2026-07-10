import { useEffect, useState, type ReactNode } from 'react';
import { Megaphone } from 'lucide-react';
import { useAnnouncementStore } from '@/store/announcementStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { AnnouncementItem } from '@/components/announcements/AnnouncementItem';

/**
 * Read-only announcement feed for the ringside `/at-show` surface (J5.4 / R1).
 *
 * A judge/steward signed in via show passcode has no account-side Message
 * Center — `/at-show` is mounted outside `UnifiedAppLayout` (no host header,
 * see atShowRoutes.tsx), so secretary announcements never reached them. This
 * reuses the EXISTING announcement store/component (realtime-subscribed,
 * read-tracked) scoped to the current show. Deliberately read-only: no
 * composer here — ringside escalation is judge-sees + in-person/steward
 * relay, not a new messaging surface (openspec/changes/judge-verification-
 * remediation, design.md "R1").
 *
 * Anon ringside-passcode sessions are Supabase anonymous-auth sessions
 * (Postgres role `authenticated`, non-null auth.uid()), and
 * `show_announcements`'s SELECT policy already admits any authenticated
 * caller (`auth.uid() is not null`, migration 057) — no RLS change needed
 * for this read. See atShowAnnouncementReadAuthzContract.test.ts.
 */
export function AtShowAnnouncementFeed({
  showId,
  children,
}: {
  showId: string | undefined;
  children: ReactNode;
}) {
  const subscribe = useAnnouncementStore(state => state.subscribe);
  const unsubscribe = useAnnouncementStore(state => state.unsubscribe);
  const announcements = useAnnouncementStore(state => state.announcements);
  const unreadCount = useAnnouncementStore(state => state.unreadCount);
  const markRead = useAnnouncementStore(state => state.markRead);
  const { user } = useAuthContext();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!showId) return;
    void subscribe([showId]);
    return () => unsubscribe();
  }, [showId, subscribe, unsubscribe]);

  if (!showId || announcements.length === 0) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="sticky top-0 z-40 border-b border-border/50 bg-card">
        <button
          type="button"
          onClick={() => setIsOpen(open => !open)}
          className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
          aria-expanded={isOpen}
        >
          <Megaphone className="h-3.5 w-3.5" aria-hidden />
          <span>Show announcements</span>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              {unreadCount}
            </span>
          )}
          <span className="ml-auto text-[10px]">{isOpen ? 'Hide' : 'Show'}</span>
        </button>
        {isOpen && (
          <div className="max-h-64 overflow-y-auto border-t border-border/50">
            {announcements.map(announcement => (
              <AnnouncementItem
                key={announcement.id}
                announcement={announcement}
                onMarkRead={id => {
                  if (user?.id) void markRead(id, user.id);
                }}
              />
            ))}
          </div>
        )}
      </div>
      {children}
    </>
  );
}
