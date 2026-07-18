/**
 * Class Management's summary tiles ARE the curated Class Management presets
 * (not-started / in-progress / completed / all-classes from
 * `CLASS_MANAGEMENT_PRESETS`) — clicking one applies the matching lifecycle
 * status filter through the same URL-backed state as the status Select.
 * One preset system, not a second menu. Extracted from `ClassManagementPage`
 * to keep that page under its size budget.
 */
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { StatusIcon } from '@/components/status';
import { Settings } from 'lucide-react';
import type { ClassLifecycleValue } from '@/lib/status/classLifecycle';
import type { ClassManagementStatusFilter } from '@/features/operational-views/operationalViews';

interface ClassLifecyclePresetTilesProps {
  statusFilter: ClassManagementStatusFilter;
  onStatusFilterChange: (value: ClassManagementStatusFilter) => void;
  totalClasses: number;
  lifecycleCounts: Record<ClassLifecycleValue, number>;
}

interface Tile {
  status: ClassManagementStatusFilter;
  label: string;
  count: number;
  icon: ReactNode;
}

export function ClassLifecyclePresetTiles({
  statusFilter,
  onStatusFilterChange,
  totalClasses,
  lifecycleCounts,
}: ClassLifecyclePresetTilesProps) {
  const tiles: Tile[] = [
    {
      status: 'all',
      label: 'Total Classes',
      count: totalClasses,
      icon: <Settings className="h-8 w-8 text-blue-500 mr-3" />,
    },
    {
      status: 'not_started',
      label: 'Not started',
      count: lifecycleCounts.not_started,
      icon: (
        <StatusIcon family="class" status="not_started" size="lg" className="mr-3" decorative />
      ),
    },
    {
      status: 'in_progress',
      label: 'In Progress',
      count: lifecycleCounts.in_progress,
      icon: (
        <StatusIcon family="class" status="in_progress" size="lg" className="mr-3" decorative />
      ),
    },
    {
      status: 'completed',
      label: 'Completed',
      count: lifecycleCounts.completed,
      icon: <StatusIcon family="class" status="completed" size="lg" className="mr-3" decorative />,
    },
  ];

  return (
    <div className="manager-class-stats-grid mb-6" role="group" aria-label="Class lifecycle presets">
      {tiles.map(tile => (
        <Card
          key={tile.status}
          role="button"
          tabIndex={0}
          aria-pressed={statusFilter === tile.status}
          onClick={() => onStatusFilterChange(tile.status)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onStatusFilterChange(tile.status);
            }
          }}
          className={`cursor-pointer transition-colors ${
            statusFilter === tile.status ? 'border-primary ring-1 ring-primary' : ''
          }`}
        >
          <CardContent className="flex items-center p-4">
            {tile.icon}
            <div>
              <div className="text-2xl font-bold">{tile.count}</div>
              <div className="text-sm text-muted-foreground">{tile.label}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default ClassLifecyclePresetTiles;
