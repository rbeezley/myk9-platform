/**
 * DogCard — ringside per-entry card primitive (Phase 1h-0).
 *
 * Ported from apps/myk9q's `DogCard` so hosts render the same judge-facing
 * card. Conforms to the existing `DogCardProps` slot contract (the slot the
 * EntryList page already injects), so a host swaps its placeholder slot for
 * this by passing `DogCard` straight into `layout.DogCard`.
 *
 * Styling lives in `../styles/ringside.css` (scoped under `.ringside-root`),
 * shipped via `@myk9/ringside/styles`. The armband renders as the teal
 * rounded square (ports myK9Q's `ArmbandBadge`); status pills / result badges
 * arrive through the `actionButton` / `resultBadges` slots the EntryList page
 * already populates.
 */

import React from 'react';
import type { DogCardProps } from '../pages/EntryList/pageProps';

export const DogCard = React.memo<DogCardProps>(
  ({
    armband,
    callName,
    breed,
    handler,
    onClick,
    className = '',
    statusBorder = 'no-status',
    actionButton,
    resultBadges,
    sectionBadge,
    onPrefetch,
    dragHandle,
  }) => {
    const isLong = String(armband).length >= 4;

    return (
      <div
        className={`dog-card ${onClick ? 'touchable' : ''} ${statusBorder} ${className} ${
          dragHandle ? 'has-drag-handle' : ''
        }`}
        onClick={onClick}
        onMouseEnter={onPrefetch}
        onTouchStart={onPrefetch}
      >
        <div className="dog-card-content">
          {dragHandle && <div className="dog-card-drag-handle">{dragHandle}</div>}

          <div className="dog-card-armband">
            <div className={`ringside-armband${isLong ? ' is-long' : ''}`}>{armband}</div>
          </div>

          <div className="dog-card-details">
            <h4 className="dog-card-name">{callName}</h4>
            <p className="dog-card-breed">{breed}</p>
            <p className="dog-card-handler">{handler}</p>
            {resultBadges && <div className="dog-card-results">{resultBadges}</div>}
          </div>
        </div>

        {actionButton && <div className="dog-card-action">{actionButton}</div>}

        {sectionBadge && (
          <div className={`section-badge section-${sectionBadge.toLowerCase()}`}>{sectionBadge}</div>
        )}
      </div>
    );
  }
);

DogCard.displayName = 'DogCard';

export default DogCard;
