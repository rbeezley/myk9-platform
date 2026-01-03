import React from 'react';
import './TVEntryCard.css';

interface TVEntryCardProps {
  armband: number;
  callName: string;
  breed?: string;
  handler: string;
  isScored: boolean;
  inRing: boolean;
  resultText?: string;
  sectionBadge?: 'A' | 'B';
  checkinStatus?: number;
}

export const TVEntryCard: React.FC<TVEntryCardProps> = ({
  armband,
  callName,
  breed,
  handler,
  isScored,
  inRing,
  resultText,
  sectionBadge,
  checkinStatus
}) => {
  // Determine card class based on status
  const cardClass = [
    'tv-entry-card',
    isScored && 'scored',
    inRing && 'in-ring'
  ].filter(Boolean).join(' ');

  // Map check-in status codes to display text
  const getCheckinStatusText = (status?: number): string => {
    if (status === undefined || status === null) return 'Not Checked In';
    switch (status) {
      case 0: return 'Not Checked In';
      case 1: return 'Checked In';
      case 2: return 'Conflict';
      case 3: return 'Pulled';
      case 4: return 'At Gate';
      default: return 'Not Checked In';
    }
  };

  return (
    <div className={cardClass}>
      {/* Armband badge */}
      <div className="tv-entry-armband">
        {armband}
      </div>

      {/* Section badge (for Novice A/B) */}
      {sectionBadge && (
        <div className={`tv-entry-section-badge section-${sectionBadge.toLowerCase()}`}>
          {sectionBadge}
        </div>
      )}

      {/* Entry info */}
      <div className="tv-entry-info">
        <div className="tv-entry-dog">
          {callName}{breed ? ` · ${breed}` : ''}
        </div>
        <div className="tv-entry-handler">
          {handler}
        </div>
      </div>

      {/* Status indicators - priority: scored > in-ring > check-in */}
      <div className="tv-entry-status">
        {isScored && resultText ? (
          /* Show result after scoring */
          <span className={`result-badge result-${resultText.toLowerCase()}`}>
            {resultText}
          </span>
        ) : inRing ? (
          /* Show in-ring during judging */
          <span className="status-badge in-ring-badge">In Ring</span>
        ) : (
          /* Show check-in status before judging */
          <span className={`checkin-badge checkin-${checkinStatus || 0}`}>
            {getCheckinStatusText(checkinStatus)}
          </span>
        )}
      </div>
    </div>
  );
};
