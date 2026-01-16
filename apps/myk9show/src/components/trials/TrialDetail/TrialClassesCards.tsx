import { startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClassCard, type ClassStatus } from '@myk9/ui';
import { TrialClass } from '../types/trial.types';
import { Play, CheckCircle2, Clock, XCircle } from 'lucide-react';

interface TrialClassesCardsProps {
  classes: TrialClass[];
  onEditClass: (classItem: TrialClass) => void;
  onDeleteClass: (classItem: TrialClass) => void;
}

/**
 * Map myK9Show status to shared ClassCard status
 */
function mapStatus(status: TrialClass['status']): ClassStatus {
  switch (status) {
    case 'Upcoming':
      return 'setup'; // 'scheduled' not in ClassStatus, use 'setup'
    case 'In Progress':
      return 'in-progress';
    case 'Completed':
      return 'completed';
    case 'Cancelled':
      return 'none'; // 'cancelled' not in ClassStatus, use 'none'
    default:
      return 'setup';
  }
}

/**
 * Get status icon based on class status
 */
function getStatusIcon(status: TrialClass['status']) {
  switch (status) {
    case 'Upcoming':
      return <Clock className="w-3.5 h-3.5" />;
    case 'In Progress':
      return <Play className="w-3.5 h-3.5" />;
    case 'Completed':
      return <CheckCircle2 className="w-3.5 h-3.5" />;
    case 'Cancelled':
      return <XCircle className="w-3.5 h-3.5" />;
    default:
      return <Clock className="w-3.5 h-3.5" />;
  }
}

/**
 * Format start time for display
 */
function formatStartTime(startTime: string | undefined): string | undefined {
  if (!startTime) return undefined;
  try {
    return new Date(startTime).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return startTime;
  }
}

/**
 * TrialClassesCards Component
 *
 * Displays trial classes as cards using the shared ClassCard component
 * from @myk9/ui for UX consistency with myK9Q.
 */
export function TrialClassesCards({
  classes,
  onEditClass,
  onDeleteClass: _onDeleteClass,
}: TrialClassesCardsProps) {
  const navigate = useNavigate();

  if (classes.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-muted-foreground">
          <div className="mb-2 text-lg font-medium">No classes to display</div>
          <div className="text-sm">Classes will appear here as cards</div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {classes.map((classItem) => (
        <ClassCard
          key={classItem.id}
          className={`${classItem.element} ${classItem.level} ${classItem.section}`}
          judgeName={classItem.judgeName || 'TBD'}
          plannedStartTime={formatStartTime(classItem.startTime)}
          status={mapStatus(classItem.status)}
          statusLabel={classItem.status}
          statusIcon={getStatusIcon(classItem.status)}
          entryCount={classItem.entries}
          completedCount={0} // Not available in TrialClass type
          onCardClick={() => startTransition(() => navigate(`/classes/${classItem.id}`))}
          onMenuClick={() => {
            // For now, show edit dialog - could be expanded to a menu
            onEditClass(classItem);
          }}
        />
      ))}
    </div>
  );
}
