import React from 'react';
import { ArmbandBadge } from './ui';
import './DogCard.css';

interface DogCardProps {
  armband: number;
  callName: string;
  breed: string;
  handler: string;
  onClick?: () => void;
  className?: string;
  statusBorder?: 'no-status' | 'checked-in' | 'conflict' | 'pulled' | 'at-gate' | 'come-to-gate' | 'in-ring' | 'completed' | 'scored' | 'placement-1' | 'placement-2' | 'placement-3' | 'result-qualified' | 'result-nq' | 'result-ex' | 'result-abs' | 'result-wd';
  actionButton?: React.ReactNode; // Heart icon for Home, Status badge for EntryList
  resultBadges?: React.ReactNode; // For scored entries
  sectionBadge?: 'A' | 'B' | null; // Section badge for combined Novice A & B view
  /** Prefetch data on hover/touch (optional) */
  onPrefetch?: () => void;
  /** Drag handle element for reordering (optional) */
  dragHandle?: React.ReactNode;
}

export const DogCard = React.memo<DogCardProps>(({
  armband,
  callName,
  breed,
  handler,
  onClick,
  className = '',
  statusBorder = 'none',
  actionButton,
  resultBadges,
  sectionBadge,
  onPrefetch,
  dragHandle,
}) => {
  // Haptic feedback is handled globally by useGlobalHaptic hook
  const handleClick = () => {
    onClick?.();
  };

  const handleMouseEnter = () => {
    // Desktop: prefetch on hover
    onPrefetch?.();
  };

  const handleTouchStart = () => {
    // Mobile: prefetch on touch
    onPrefetch?.();
  };

  return (
    <div
      className={`dog-card ${onClick ? 'touchable' : ''} ${statusBorder} ${className} ${dragHandle ? 'has-drag-handle' : ''}`}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onTouchStart={handleTouchStart}
    >
      <div className="dog-card-content">
        {/* Drag handle - rendered inside card on the left */}
        {dragHandle && (
          <div className="dog-card-drag-handle">
            {dragHandle}
          </div>
        )}
        <div className="dog-card-armband">
          <ArmbandBadge number={armband} />
        </div>

        <div className="dog-card-details">
          <h4 className="dog-card-name">{callName}</h4>
          <p className="dog-card-breed">{breed}</p>
          <p className="dog-card-handler">{handler}</p>
          {resultBadges && (
            <div className="dog-card-results">
              {resultBadges}
            </div>
          )}
        </div>
      </div>

      {actionButton && (
        <div className="dog-card-action">
          {actionButton}
        </div>
      )}

      {sectionBadge && (
        <div className={`section-badge section-${sectionBadge.toLowerCase()}`}>
          {sectionBadge}
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if key props change
  return (
    prevProps.armband === nextProps.armband &&
    prevProps.callName === nextProps.callName &&
    prevProps.statusBorder === nextProps.statusBorder &&
    prevProps.className === nextProps.className &&
    !!prevProps.dragHandle === !!nextProps.dragHandle
  );
});