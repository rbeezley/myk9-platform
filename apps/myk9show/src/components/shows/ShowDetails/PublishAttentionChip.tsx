import React from 'react';
import { usePremiumPublishControl } from '@/features/premium/usePremiumPublishControl';
import { resolveShowUses } from '@/features/show-workbench/showUses';
import { useShowStore } from '@/store/showStore';
import { PREMIUM_CARD_ANCHOR } from '@/features/show-workbench/publishReadiness';

interface PublishAttentionChipProps {
  showId: string;
  canManageShow: boolean;
  /** Opens the About tab, where the publishing cards are, on the card (anchor id) that fixes it. */
  onOpen: (anchor: string) => void;
}

/**
 * The publishing nudge, as the tail of the header's status line (MYK9-1282): "Published ·
 * premium list not yet published". Plain amber text, not a second chip beside a status pill.
 *
 * The publishing cards live on the About tab, so the header carries the task: while the premium
 * list or the landing page is unpublished, it says so and opens About on that card on click. Once both
 * are published it renders nothing. It reads the same publish state the cards do.
 */
export const PublishAttentionChip: React.FC<PublishAttentionChipProps> = ({
  showId,
  canManageShow,
  onOpen,
}) => {
  const { infoState, hasPublishedPremium, landingUnpublished } = usePremiumPublishControl(
    showId,
    true,
    canManageShow
  );
  const show = useShowStore(state => state.shows.find(candidate => candidate.id === showId));
  const uses = resolveShowUses(show);
  if (!canManageShow || infoState !== 'ready') return null;
  // MYK9-1686: the switches decide which nudges exist at all. A club that publishes its own
  // premium list has no premium nudge but still hears about an unpublished landing page.
  const landingNudge =
    uses.usesLandingPage && landingUnpublished && (hasPublishedPremium || uses.publishesOwnPremium);
  // "Publish landing page" lives on the premium card, not the landing card (INTENT: readiness
  // links land on the fix).
  const target =
    !hasPublishedPremium && !uses.publishesOwnPremium
      ? { label: 'premium list not yet published', anchor: PREMIUM_CARD_ANCHOR }
      : landingNudge
        ? { label: 'landing page not yet published', anchor: PREMIUM_CARD_ANCHOR }
        : null;
  if (!target) return null;
  return (
    <>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={() => onOpen(target.anchor)}
        // Small to sit in the line under the name; the pseudo-element stretches the target to 44px
        // (docs/INTENT.md) without taking any layout space.
        className="relative inline-flex items-center font-medium text-warning underline-offset-2 before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[''] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {target.label}
      </button>
    </>
  );
};
