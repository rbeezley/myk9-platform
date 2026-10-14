import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { Dog } from '@/types/dog-types';

interface DuplicateDogAlertProps {
  dog: Dog;
  /** Why this dog is offered; the calm sentence after "This looks like {name}". */
  reason: string;
  onUseExistingDog: () => void;
  /** Omitted when a separate dog is not an option (the number is already taken). */
  onCreateSeparateDog?: (() => void) | undefined;
}

/**
 * The one "This looks like … / Use existing dog" card, shared by the Save-time
 * duplicate check and the Registration step's "Find dog" lookup (MYK9-1162).
 */
export const DuplicateDogAlert: React.FC<DuplicateDogAlertProps> = ({
  dog,
  reason,
  onUseExistingDog,
  onCreateSeparateDog,
}) => (
  <Alert className="border-amber-300 bg-amber-50 text-amber-950">
    <AlertCircle className="h-4 w-4 text-amber-700" />
    <AlertDescription>
      <div className="space-y-3">
        <p>
          This looks like {dog.callName || dog.name}, {reason}.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onUseExistingDog}>
            Use existing dog
          </Button>
          {onCreateSeparateDog && (
            <Button size="sm" variant="outline" onClick={onCreateSeparateDog}>
              Create separate dog
            </Button>
          )}
        </div>
      </div>
    </AlertDescription>
  </Alert>
);
