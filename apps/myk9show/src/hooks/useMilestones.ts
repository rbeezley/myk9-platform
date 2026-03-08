/**
 * useMilestones — Compute which progressive tip to show based on user activity.
 *
 * Milestones are checked in order; the first un-dismissed tip wins.
 * Tips show once and stay dismissed forever via the user_milestones table.
 */

import { useMemo, useEffect, useCallback } from 'react';
import { useDogsQuery } from '@/hooks/queries/useDogsDatabase';
import { useShowsQuery } from '@/hooks/queries/useShowsDatabase';
import {
  useMilestonesQuery,
  useAchieveMilestoneMutation,
  useDismissMilestoneMutation,
} from '@/hooks/queries/useMilestonesDatabase';
import type { UserMilestone } from '@/services/database/queries/milestoneQueries';
import { useAuthContext } from '@/hooks/useAuthContext';

export interface MilestoneTip {
  milestoneKey: string;
  title: string;
  message: string;
  cta?: { label: string; href: string };
}

interface MilestoneDefinition {
  key: string;
  /** Return true if the user has reached this milestone. */
  condition: (ctx: MilestoneContext) => boolean;
  tip: Omit<MilestoneTip, 'milestoneKey'>;
}

/** Ordered milestone definitions — first applicable tip is shown. */
const MILESTONE_DEFINITIONS: MilestoneDefinition[] = [
  {
    key: 'first_login',
    condition: () => true, // Always true — shown on first visit if no dogs
    tip: {
      title: 'Welcome to myK9Show!',
      message: 'Start by adding your dogs to your profile.',
      cta: { label: 'Add a Dog', href: '/dogs/new' },
    },
  },
  {
    key: 'first_dog_added',
    condition: ctx => ctx.dogCount >= 1,
    tip: {
      title: 'Your dog is registered!',
      message: 'Browse upcoming shows to find your first event.',
      cta: { label: 'Browse Shows', href: '/shows' },
    },
  },
  {
    key: 'first_show_created',
    condition: ctx => ctx.showCount >= 1,
    tip: {
      title: 'Your first show is set up!',
      message: 'You can import entries from a CSV file to save time.',
      cta: { label: 'Manage Shows', href: '/secretary/shows' },
    },
  },
  {
    key: 'first_show_completed',
    condition: ctx => ctx.completedShowCount >= 1,
    tip: {
      title: 'Show complete!',
      message: 'Did you know you can print run orders and score sheets?',
    },
  },
  {
    key: 'five_shows_completed',
    condition: ctx => ctx.completedShowCount >= 5,
    tip: {
      title: 'You are a pro!',
      message: 'Consider setting up automated results notifications for your exhibitors.',
    },
  },
];

interface MilestoneContext {
  dogCount: number;
  showCount: number;
  completedShowCount: number;
}

interface MilestoneResult {
  tip: MilestoneTip | null;
  pendingKey: string | null;
}

/** Pure function — finds the first applicable un-dismissed milestone. */
function findActiveMilestone(
  milestones: UserMilestone[] | undefined,
  ctx: MilestoneContext
): MilestoneResult {
  const dismissedKeys = new Set(
    milestones?.filter(m => m.tip_dismissed).map(m => m.milestone_key) ?? []
  );
  const achievedKeys = new Set(milestones?.map(m => m.milestone_key) ?? []);

  for (const def of MILESTONE_DEFINITIONS) {
    if (dismissedKeys.has(def.key)) continue;
    if (!def.condition(ctx)) continue;

    return {
      tip: { milestoneKey: def.key, ...def.tip },
      pendingKey: achievedKeys.has(def.key) ? null : def.key,
    };
  }

  return { tip: null, pendingKey: null };
}

export function useMilestones() {
  const { user } = useAuthContext();
  const { data: milestones, isLoading: milestonesLoading } = useMilestonesQuery(!!user);
  const { data: dogs } = useDogsQuery();
  const { data: shows } = useShowsQuery();
  const achieveMilestone = useAchieveMilestoneMutation();
  const dismissMilestone = useDismissMilestoneMutation();

  const ctx = useMemo(
    (): MilestoneContext => ({
      dogCount: dogs?.length ?? 0,
      showCount: shows?.length ?? 0,
      completedShowCount:
        shows?.filter(s => s.status === 'completed' || s.status === 'results_published').length ??
        0,
    }),
    [dogs, shows]
  );

  const { activeTip, needsAchieve } = useMemo(() => {
    if (!user || milestonesLoading) return { activeTip: null, needsAchieve: null };
    const result = findActiveMilestone(milestones, ctx);
    return { activeTip: result.tip, needsAchieve: result.pendingKey };
  }, [user, milestones, milestonesLoading, ctx]);

  // Auto-achieve milestone as a proper side effect
  useEffect(() => {
    if (needsAchieve) {
      achieveMilestone.mutate(needsAchieve);
    }
  }, [needsAchieve, achieveMilestone]);

  const dismiss = useCallback(
    (milestoneKey: string) => {
      dismissMilestone.mutate(milestoneKey);
    },
    [dismissMilestone]
  );

  return { activeTip, dismiss, isLoading: milestonesLoading };
}
