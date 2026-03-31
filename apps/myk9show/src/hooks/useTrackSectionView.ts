import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/services/database/supabaseClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import { logger } from '@/services/LoggingService';

export const TRACKED_SECTIONS = {
  QUALIFICATION_TREND: 'qualification_trend_chart',
  DOG_BREAKDOWN: 'dog_breakdown_cards',
  FASTEST_TIMES: 'fastest_times_table',
  LIFETIME_PAGE: 'lifetime_analytics_page',
} as const;

export type TrackedSection = (typeof TRACKED_SECTIONS)[keyof typeof TRACKED_SECTIONS];

/** Fire-and-forget insert into analytics_events. Isolated to contain the type cast. */
function insertAnalyticsEvent(sectionName: string, page: string) {
  (
    supabase.from as unknown as (table: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    }
  )('analytics_events')
    .insert({
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
    })
    .catch(() => {
      // Network failure — non-critical telemetry, silently drop
    });
}

/**
 * Tracks when a section scrolls into view (10% visible).
 * Fires one Supabase insert per section per page session.
 * No-ops for unauthenticated users. Fire-and-forget — non-critical telemetry.
 */
export function useTrackSectionView(
  sectionName: TrackedSection,
  page: string
): (node: HTMLDivElement | null) => void {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const trackedRef = useRef(new Set<string>());
  const { user } = useAuthContext();
  const [attached, setAttached] = useState(false);

  const callbackRef = useCallback((node: HTMLDivElement | null) => {
    elementRef.current = node;
    setAttached(node !== null);
  }, []);

  useEffect(() => {
    const element = elementRef.current;
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
        insertAnalyticsEvent(sectionName, page);
      },
      { threshold: 0.1 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [user, sectionName, page, attached]);

  return callbackRef;
}
