import { useEffect, useRef } from 'react';
import { supabase } from '@/services/database/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/services/LoggingService';

export const TRACKED_SECTIONS = {
  QUALIFICATION_TREND: 'qualification_trend_chart',
  DOG_BREAKDOWN: 'dog_breakdown_cards',
  FASTEST_TIMES: 'fastest_times_table',
  LIFETIME_PAGE: 'lifetime_analytics_page',
} as const;

export type TrackedSection = (typeof TRACKED_SECTIONS)[keyof typeof TRACKED_SECTIONS];

/** Fire-and-forget insert into analytics_events. Isolated to contain the type cast. */
function insertAnalyticsEvent(userId: string, sectionName: string, page: string) {
  // analytics_events table is not in generated types yet — cast isolated here
  (
    supabase.from as unknown as (table: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    }
  )('analytics_events')
    .insert({
      user_id: userId,
      event_type: 'section_view',
      section_name: sectionName,
      page,
      metadata: null,
    })
    .then(({ error }) => {
      if (error) {
        logger.debug('Analytics event insert failed', 'analytics', {
          sectionName,
          page,
          error: error.message,
        });
      }
    });
}

/**
 * Tracks when a section scrolls into view (50% visible).
 * Fires one Supabase insert per section per page session.
 * No-ops for unauthenticated users. Fire-and-forget — non-critical telemetry.
 */
export function useTrackSectionView(
  sectionName: TrackedSection,
  page: string
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const trackedRef = useRef(new Set<string>());
  const { user } = useAuth();

  useEffect(() => {
    const element = ref.current;
    if (!element || !user) return;

    const key = `${page}:${sectionName}`;
    if (trackedRef.current.has(key)) return;

    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (trackedRef.current.has(key)) return;

        trackedRef.current.add(key);
        observer.disconnect();
        insertAnalyticsEvent(user.id, sectionName, page);
      },
      { threshold: 0.5 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [user, sectionName, page]);

  return ref;
}
