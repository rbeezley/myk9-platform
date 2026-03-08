/**
 * useSmartNotifications — Compute actionable insights from existing data.
 *
 * These are NOT persisted notifications. They're derived in real-time from
 * cached React Query data: pending payments, closing entries, expiring
 * vaccinations, unscored classes, etc.
 */

import { useMemo } from 'react';
import { useShowsQuery } from '@/hooks/queries/useShowsDatabase';
import { useDogsQuery } from '@/hooks/queries/useDogsDatabase';
import { useAuthContext } from '@/hooks/useAuthContext';

export type SmartNotificationUrgency = 'action_required' | 'attention' | 'info';

export interface SmartNotification {
  id: string;
  title: string;
  detail: string;
  urgency: SmartNotificationUrgency;
  actionLabel?: string;
  actionHref?: string;
}

const URGENCY_ORDER: Record<SmartNotificationUrgency, number> = {
  action_required: 0,
  attention: 1,
  info: 2,
};

export function useSmartNotifications() {
  const { user } = useAuthContext();
  const { data: shows } = useShowsQuery();
  const { data: dogs } = useDogsQuery();

  const notifications = useMemo((): SmartNotification[] => {
    if (!user) return [];
    const items: SmartNotification[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── Show-based insights ──────────────────────────────────────
    if (shows) {
      for (const show of shows) {
        const showName = show.name ?? 'Unknown Show';
        const showId = show.id;
        const { status } = show;

        // Entry period closing soon
        if (show.entryCloseDate && status !== 'completed' && status !== 'results_published') {
          const closeDate = new Date(show.entryCloseDate);
          const diffDays = Math.ceil((closeDate.getTime() - today.getTime()) / 86400000);

          if (diffDays === 0) {
            items.push({
              id: `entry-closes-today-${showId}`,
              title: 'Entries close today',
              detail: `${showName} — entry period ends today.`,
              urgency: 'action_required',
              actionLabel: 'View Show',
              actionHref: `/shows/${showId}`,
            });
          } else if (diffDays === 1) {
            items.push({
              id: `entry-closes-tomorrow-${showId}`,
              title: 'Entries close tomorrow',
              detail: `${showName} — last day to submit entries is tomorrow.`,
              urgency: 'attention',
              actionLabel: 'View Show',
              actionHref: `/shows/${showId}`,
            });
          } else if (diffDays > 1 && diffDays <= 3) {
            items.push({
              id: `entry-closes-soon-${showId}`,
              title: `Entries close in ${diffDays} days`,
              detail: `${showName} — entry deadline approaching.`,
              urgency: 'attention',
              actionLabel: 'View Show',
              actionHref: `/shows/${showId}`,
            });
          }
        }

        // Show starts soon (within 7 days)
        if (show.startDate && status !== 'completed' && status !== 'results_published') {
          const startDate = new Date(show.startDate);
          const diffDays = Math.ceil((startDate.getTime() - today.getTime()) / 86400000);

          if (diffDays === 1) {
            items.push({
              id: `show-tomorrow-${showId}`,
              title: 'Show starts tomorrow',
              detail: `${showName} begins tomorrow.`,
              urgency: 'attention',
              actionLabel: 'View Show',
              actionHref: `/shows/${showId}`,
            });
          } else if (diffDays > 1 && diffDays <= 7) {
            items.push({
              id: `show-upcoming-${showId}`,
              title: `Show in ${diffDays} days`,
              detail: `${showName} starts ${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`,
              urgency: 'info',
              actionLabel: 'View Show',
              actionHref: `/shows/${showId}`,
            });
          }
        }
      }
    }

    // ── Dog-based insights ───────────────────────────────────────
    if (dogs && dogs.length === 0) {
      items.push({
        id: 'no-dogs',
        title: 'Add your first dog',
        detail: 'Register your dogs to start entering shows.',
        urgency: 'info',
        actionLabel: 'Add Dog',
        actionHref: '/dogs/new',
      });
    }

    // Sort by urgency, then alphabetically
    items.sort((a, b) => {
      const urgencyDiff = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
      if (urgencyDiff !== 0) return urgencyDiff;
      return a.title.localeCompare(b.title);
    });

    return items;
  }, [user, shows, dogs]);

  return { notifications, count: notifications.length };
}
