import type { HeroParent } from '@/components/common/DetailHero';
import type { Show } from '@/types/show-types';

/**
 * The host club as the show hero's parent link (MYK9-930, audit M16). A show
 * with no host club on record, or one with no name to show, has no parent link
 * rather than a dead one.
 */
export function showHeroParent(show: Pick<Show, 'clubId' | 'clubName'>): HeroParent | undefined {
  if (!show.clubId || !show.clubName) return undefined;
  return { label: show.clubName, href: `/clubs/${show.clubId}` };
}
