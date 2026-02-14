import { History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatDistanceToNow } from 'date-fns';
import type { BaseConflictResolution } from '@/types/conflict-types';

interface HistoryTabProps {
  resolutionHistory: BaseConflictResolution[];
}

export function HistoryTab({ resolutionHistory }: HistoryTabProps) {
  return (
    <div className="space-y-4">
      <Alert>
        <History className="h-4 w-4" />
        <AlertDescription>
          Previous resolutions for similar conflicts. Learn from past decisions.
        </AlertDescription>
      </Alert>

      {resolutionHistory.length > 0 ? (
        <div className="space-y-3">
          {resolutionHistory.map((resolution, index) => (
            <div
              key={index}
              className="p-4 border rounded-lg space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{resolution.strategy}</Badge>
                  <span className="text-sm text-muted-foreground">
                    by {resolution.resolvedBy}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {formatDistanceToNow(resolution.resolvedAt, { addSuffix: true })}
                </span>
              </div>
              {resolution.resolutionNotes && (
                <p className="text-sm">{resolution.resolutionNotes}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          No previous resolutions found for this entity
        </div>
      )}
    </div>
  );
}
