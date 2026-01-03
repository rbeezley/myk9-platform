import React from 'react';
import './shared-ui.css';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Reusable component for displaying empty states
 * Used when there are no items to display (e.g., no search results, no entries, etc.)
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  message,
  action,
  className = ''
}) => {
  return (
    <div className={`empty-state ${className}`.trim()}>
      {icon && <div className="empty-state-icon">{icon}</div>}
      <h3 className="empty-state-title">{title}</h3>
      {message && <p className="empty-state-message">{message}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
};
