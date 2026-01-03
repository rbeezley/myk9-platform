/**
 * Background Refresh Indicator
 *
 * Shows a subtle indicator when data is being refreshed in the background
 * (part of stale-while-revalidate pattern)
 */

import React from 'react';
import './shared-ui.css';

interface RefreshIndicatorProps {
  /** Whether to show the indicator */
  isRefreshing: boolean;
  /** Position on screen */
  position?: 'top' | 'bottom';
  /** Custom message */
  message?: string;
}

export const RefreshIndicator: React.FC<RefreshIndicatorProps> = ({
  isRefreshing,
  position = 'top',
  message = 'Refreshing...',
}) => {
  if (!isRefreshing) return null;

  return (
    <div className={`refresh-indicator refresh-indicator--${position}`}>
      <div className="refresh-indicator__content">
        <div className="refresh-indicator__spinner" />
        <span className="refresh-indicator__message">{message}</span>
      </div>
    </div>
  );
};
