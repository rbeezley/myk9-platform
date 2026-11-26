import React from 'react';
import { Button } from '@/components/ui/button';
import type { QualificationsReadState } from '@/features/judges/qualificationsReadState';

interface QualificationsReadNoticeProps {
  state: QualificationsReadState;
  onRetry: () => void;
}

/** MYK9-2394: shown in place of the qualifications form until the list has loaded. */
export const QualificationsReadNotice: React.FC<QualificationsReadNoticeProps> = ({
  state,
  onRetry,
}) =>
  state === 'loading' ? (
    <div role="status" className="p-6 text-center text-sm text-muted-foreground">
      Loading qualifications...
    </div>
  ) : (
    <div role="alert" className="flex flex-col items-center gap-3 p-6 text-center">
      <p className="text-muted-foreground">
        Couldn't load this person's judge qualifications. Editing is off until they load.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
