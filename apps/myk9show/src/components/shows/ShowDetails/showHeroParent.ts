import type { HeroParent } from '@/components/common/DetailHero';
import type { Show } from '@/types/show-types';

/**
 * The host club as the show hero's parent (MYK9-930, audit M16). A show with no
 * named host club has no parent at all. The name is a link only when the viewer
 * can open the club page (`canOpenClub`) and the show names the club it links to;
 * otherwise it is plain text rather than a link to a page that would refuse them.
 */
export function showHeroParent(
  show: { clubId?: Show['clubId'] | undefined; clubName?: Show['clubName'] | undefined },
  { canOpenClub }: { canOpenClub: boolean }
): HeroParent | undefined {
  if (!show.clubName) return undefined;
  if (!canOpenClub || !show.clubId) return { label: show.clubName };
  return { label: show.clubName, href: `/clubs/${show.clubId}` };
}
