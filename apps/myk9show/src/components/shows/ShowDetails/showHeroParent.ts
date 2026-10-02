import type { HeroParent } from '@/components/common/DetailHero';
import { heroParentLink, type HeroViewer } from '@/components/common/heroParentLink';
import type { Show } from '@/types/show-types';

/**
 * The host club as the show hero's parent (MYK9-930, audit M16). A show with no
 * named host club has no parent at all; whether the name is a link is the shared
 * `heroParentLink` rule (a show with a name but no club id cannot be linked).
 */
export function showHeroParent(
  show: { clubId?: Show['clubId'] | undefined; clubName?: Show['clubName'] | undefined },
  { viewer }: { viewer: HeroViewer }
): HeroParent | undefined {
  if (!show.clubName) return undefined;
  if (!show.clubId) return { label: show.clubName };
  return heroParentLink({ target: 'club', id: show.clubId, label: show.clubName, viewer });
}
