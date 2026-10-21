import React from 'react';
import { usePremiumPublishControl } from '@/features/premium/usePremiumPublishControl';

interface PublishAttentionChipProps {
  showId: string;
  canManageShow: boolean;
  /** Opens the details panel, where the publishing cards are. */
  onOpen: () => void;
}

/**
 * The publishing nudge, as the tail of the header's status line (MYK9-1282): "Published ·
 * premium list not yet published". Plain amber text, not a second chip beside a status pill.
 *
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
    ? 'premium list not yet published'
    : landingUnpublished
      ? 'landing page not yet published'
      : null;
  if (!label) return null;
  return (
    <>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={onOpen}
        // Small to sit in the line under the name; the pseudo-element stretches the target to 44px
        // (docs/INTENT.md) without taking any layout space.
        className="relative inline-flex items-center font-medium text-warning underline-offset-2 before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[''] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
      </button>
    </>
  );
};
