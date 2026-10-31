/**
 * What Set Max Time shows while the class's scoring mode is still being read (MYK9-1569).
 * The form sizes its inputs once, so it waits; this keeps the wait from being a blank
 * screen: a loading line with Cancel, and on a failed read a plain message with Retry.
 */
import type React from 'react';
import { Loader2, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClassDialogShell } from './ClassDialogShell';

interface MaxTimeLookupDialogProps {
  className: string;
  failed: boolean;
  onRetry: () => void;
  onClose: () => void;
}

export const MaxTimeLookupDialog: React.FC<MaxTimeLookupDialogProps> = ({
  className,
  failed,
  onRetry,
  onClose,
}) => (
  <ClassDialogShell
    icon={Timer}
    eyebrow="Set max time"
    className={className}
    onClose={onClose}
    closeLabel="Cancel"
  >
    {failed ? (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-sm text-foreground">
          Couldn&apos;t check how this class is timed. Try again, or cancel and come back.
        </p>
        <Button variant="outline" className="min-h-11" onClick={onRetry}>
          Retry
        </Button>
      </div>
    ) : (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        Checking how this class is timed...
      </p>
    )}
  </ClassDialogShell>
);
