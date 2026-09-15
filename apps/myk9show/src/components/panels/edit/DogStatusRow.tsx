import React, { useContext } from 'react';
import { Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DOG_STATUS_BADGES } from '@/components/dogs/common/dogStatusBadges';
import { DogEditContext } from './DogEditPanel';

/**
 * Lifecycle status, where someone looking for it actually looks. Deliberately a
 * LINK into `DogStatusDialog`, not a field on this form: marking a dog retired
 * or deceased is not an attribute edit like changing a colour, and the dialog
 * carries the copy and the date-of-passing input that moment needs. A second
 * editor here would be the duplication this phase is meant to remove.
 *
 * Renders nothing without `onChangeStatus` — see `DogEditContextType`.
 */
export const DogStatusRow: React.FC = () => {
  const { dogStatus, dogDeceasedDate, onChangeStatus } = useContext(DogEditContext);

  if (!onChangeStatus) return null;

  const badge = DOG_STATUS_BADGES[dogStatus || 'active'];
  const deceasedSuffix = dogStatus === 'deceased' && dogDeceasedDate ? ` — ${dogDeceasedDate}` : '';

  return (
    <div className="flex items-center justify-between gap-4 pb-4 border-b border-border/30">
      <div className="space-y-1">
        <Label className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
          Status
        </Label>
        <div>
          {badge && (
            <Badge variant="secondary" className={badge.className}>
              {badge.label}
              {deceasedSuffix}
            </Badge>
          )}
        </div>
      </div>
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
    </div>
  );
};
