import React from 'react';
import { Settings, Calendar, Coffee, Clock, Play, CheckCircle, CircleDashed } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

export interface ClassStatusBadgeProps {
  /** Class status: 'none', 'setup', 'briefing', 'break', 'start_time', 'in_progress', 'completed' */
  status: string;
  /** Optional time to display (e.g., "2:30 PM") */
  time?: string | null;
  /** Whether the badge is clickable */
  clickable?: boolean;
  /** Click handler */
  onClick?: (e: React.MouseEvent) => void;
  /** Icon size (default: 16) */
  iconSize?: number;
  /** Additional CSS classes */
  className?: string;
  /** Render as button instead of div */
  asButton?: boolean;
}

/**
 * Standardized class status badge with Lucide icons
 * Uses centralized colors from design-tokens.css and StatusBadge component
 *
 * @example
 * <ClassStatusBadge status="in_progress" clickable onClick={handleClick} />
 * <ClassStatusBadge status="briefing" time="2:30 PM" />
 */
export const ClassStatusBadge: React.FC<ClassStatusBadgeProps> = ({
  status,
  time,
  clickable = false,
  onClick,
  iconSize = 16,
  className = '',
  asButton = false
}) => {
  // Get label based on status (using shorter labels)
  const getLabel = (status: string): string => {
    switch (status) {
      case 'setup': return 'Setup';
      case 'briefing': return 'Briefing';
      case 'break': return 'Break';
      case 'start_time': return 'Starts';
      case 'in_progress': return 'Active';
      case 'completed': return 'Done';
      default: return '';
    }
  };

  // Get icon component based on status
  const getIcon = (status: string): React.ReactNode => {
    const props = { size: iconSize, className: 'status-icon' };

    switch (status) {
      case 'setup': return <Settings {...props} />;
      case 'briefing': return <Calendar {...props} />;
      case 'break': return <Coffee {...props} />;
      case 'start_time': return <Clock {...props} />;
      case 'in_progress': return <Play {...props} />;
      case 'completed': return <CheckCircle {...props} />;
      default: return <CircleDashed {...props} />;
    }
  };

  // Map status to StatusBadge color class
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'setup': return 'setup';
      case 'briefing': return 'briefing';
      case 'break': return 'break';
      case 'start_time': return 'start-time';
      case 'in_progress': return 'in-progress';
      case 'completed': return 'completed';
      default: return 'pending';
    }
  };

  return (
    <StatusBadge
      label={getLabel(status)}
      time={time}
      statusColor={getStatusColor(status)}
      icon={getIcon(status)}
      clickable={clickable}
      onClick={onClick}
      className={className}
      asButton={asButton}
    />
  );
};
