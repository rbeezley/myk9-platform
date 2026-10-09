import { Button } from '@/components/ui/button';
import { Heart, Calendar, List } from 'lucide-react';

export type HealthViewMode = 'timeline' | 'traditional';

interface HealthRecordsHeaderProps {
  viewMode: HealthViewMode;
  onViewModeChange: (mode: HealthViewMode) => void;
  showViewToggle: boolean;
}

// The header wraps (title row, then the toggle row) rather than running the
// nowrap toggle buttons past a 390px viewport (MYK9-1069).
export function HealthRecordsHeader({
  viewMode,
  onViewModeChange,
  showViewToggle,
}: HealthRecordsHeaderProps) {
  return (
    <div
      data-testid="health-records-header"
      className="flex flex-wrap items-center justify-between gap-3 mb-6"
    >
      <div className="min-w-0">
        <h2 className="myk9-section-title flex items-center gap-2">
          <Heart className="h-5 w-5" />
          Health Records
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Track your dog&apos;s health history and upcoming care needs
        </p>
      </div>
      {showViewToggle && (
        <div data-testid="health-view-toggle" className="flex flex-wrap gap-2">
          <Button
            variant={viewMode === 'timeline' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onViewModeChange('timeline')}
          >
            <Calendar className="h-4 w-4 mr-2" />
            Timeline View
          </Button>
          <Button
            variant={viewMode === 'traditional' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onViewModeChange('traditional')}
          >
            <List className="h-4 w-4 mr-2" />
            Traditional View
          </Button>
        </div>
      )}
    </div>
  );
}
