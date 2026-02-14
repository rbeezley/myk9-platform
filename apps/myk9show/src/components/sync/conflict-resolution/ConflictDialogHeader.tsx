import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { isExtendedConflict, getPriorityColor } from '../conflict-resolution-utils';
import type { NormalizedConflict, ConflictResolutionDialogProps } from '../conflict-resolution-types';

interface ConflictDialogHeaderProps {
  normalizedConflict: NormalizedConflict;
  conflict: ConflictResolutionDialogProps['conflict'];
  onDismiss: () => void;
}

export function ConflictDialogHeader({ normalizedConflict, conflict, onDismiss }: ConflictDialogHeaderProps) {
  return (
    <DialogHeader>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-warning/10 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-warning" />
          </div>
          <div>
            <DialogTitle className="text-xl">Resolve Data Conflict</DialogTitle>
            <DialogDescription className="mt-1">
              {normalizedConflict.entityType} conflict detected • {
                isExtendedConflict(conflict) && conflict.fieldPath || 'Multiple fields'
              }
            </DialogDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isExtendedConflict(conflict) && (
            <Badge variant="outline" className={getPriorityColor(conflict.priority)}>
              {conflict.priority} priority
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onDismiss}
            className="ml-2"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </DialogHeader>
  );
}
