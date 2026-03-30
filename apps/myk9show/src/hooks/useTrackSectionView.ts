import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/services/database/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/services/LoggingService';

export const TRACKED_SECTIONS = {
  QUALIFICATION_TREND: 'qualification_trend_chart',
  DOG_BREAKDOWN: 'dog_breakdown_cards',
  FASTEST_TIMES: 'fastest_times_table',
  LIFETIME_PAGE: 'lifetime_analytics_page',
} as const;

/** Module-level set for one-per-session dedup. Keyed by `page:sectionName`. */
let trackedKeys = new Set<string>();
let lastPathname = '';

/** Exported for test cleanup only. */
export function _resetTrackedSections() {
  trackedKeys = new Set();
  lastPathname = '';
}

/**
 * Tracks when a section scrolls into view (50% visible).
 * Fires one Supabase insert per section per page session.
 * No-ops for unauthenticated users. Fire-and-forget — non-critical telemetry.
 */
export function useTrackSectionView(
  sectionName: string,
  page: string
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const { user } = useAuth();
  const { pathname } = useLocation();

  // Reset tracked set on navigation
  useEffect(() => {
    if (pathname !== lastPathname) {
      trackedKeys = new Set();
      lastPathname = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    const element = ref.current;
    if (!element || !user) return;

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const key = `${page}:${sectionName}`;
          if (trackedKeys.has(key)) continue;

          trackedKeys.add(key);
          observer.disconnect();

          supabase
            .from('analytics_events')
            .insert({
              user_id: user.id,
              event_type: 'section_view',
              section_name: sectionName,
              page,
              metadata: null,
            })
            .then(({ error }: { error: { message: string } | null }) => {
              if (error) {
                logger.debug('Analytics event insert failed', 'analytics', {
                  sectionName,
                  page,
                  error: error.message,
                });
              }
            });

          break;
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [user, sectionName, page]);

  return ref;
}
