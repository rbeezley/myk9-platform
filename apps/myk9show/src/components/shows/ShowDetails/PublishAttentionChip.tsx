import React from 'react';
import { usePremiumPublishControl } from '@/features/premium/usePremiumPublishControl';

interface PublishAttentionChipProps {
  showId: string;
  canManageShow: boolean;
  /** Opens the details panel, where the publishing cards are. */
  onOpen: () => void;
}

/**
 * Collapsing the publishing cards under the header must not hide a task: while the premium list
 * or the landing page is unpublished, the header says so and opens the panel on click. Once both
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
  if (!canManageShow || infoState !== 'ready') return null;
  const label = !hasPublishedPremium
    ? 'Premium not published'
    : landingUnpublished
      ? 'Landing page not published'
      : null;
  if (!label) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      // Small to sit in the line under the name; the pseudo-element stretches the target to 44px
      // (docs/INTENT.md) without taking any layout space.
      className="relative inline-flex h-5 items-center rounded-full border border-warning/30 bg-warning/10 px-2 text-xs font-medium text-warning before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[''] hover:bg-warning/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
    </button>
  );
};
