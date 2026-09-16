import React, { useContext, useId } from 'react';
import { Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DOG_STATUS_BADGES } from '@/components/dogs/common/dogStatusBadges';
import { DogEditContext } from './DogEditPanel';

/**
 * Lifecycle status, where someone looking for it actually looks. Deliberately a
 * LINK into `DogStatusDialog`, not a field on this form: marking a dog retired
 * or deceased is not an attribute edit like changing a colour, and the dialog
 * carries the copy and the date-of-passing input that moment needs. A second
 * editor here would be the duplication this phase is meant to remove.
 *
 * Without `onChangeStatus` (e.g. the person-detail Dogs tab, which has no
 * dialog mounted behind it — MYK9-594) the row still renders, read-only: a
 * badge with no button. The value should be visible on every Edit Dog
 * surface; it is only changeable where a handler exists.
 */
export const DogStatusRow: React.FC = () => {
  const { dogStatus, dogDeceasedDate, onChangeStatus } = useContext(DogEditContext);
  const labelId = useId();

  // A known key falls through to DOG_STATUS_BADGES; an out-of-union value
  // (bad data, a status this build doesn't know about yet) still gets a
  // visible, neutral badge rather than an empty one now that there is no
  // button to keep the row from reading as blank.
  const badge = DOG_STATUS_BADGES[dogStatus || 'active'] ?? {
    label: dogStatus || 'Unknown',
    className: 'text-xs bg-muted text-muted-foreground',
  };
  const deceasedSuffix = dogStatus === 'deceased' && dogDeceasedDate ? ` — ${dogDeceasedDate}` : '';

  return (
    <div className="flex items-center justify-between gap-4 pb-4 border-b border-border/30">
      <div className="space-y-1">
        {/* A <span>, not the shared <Label>: there is no form control here for a
            label to name -- the value is a badge, and the edit happens in the
            dialog the button raises. `aria-labelledby` still ties the badge to
            it, so the read-only row (no button, MYK9-594) exposes the pair as
            one named group instead of two unrelated pieces of text. */}
        <span
          id={labelId}
          className="block text-xs font-medium text-muted-foreground tracking-wide uppercase"
        >
          Status
        </span>
        <div role="group" aria-labelledby={labelId}>
          <Badge variant="secondary" className={badge.className}>
            {badge.label}
            {deceasedSuffix}
          </Badge>
        </div>
      </div>
      {onChangeStatus && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onChangeStatus}
          aria-haspopup="dialog"
          className="gap-2 shrink-0"
        >
          <Activity className="h-4 w-4" />
          Change status
        </Button>
      )}
    </div>
  );
};
