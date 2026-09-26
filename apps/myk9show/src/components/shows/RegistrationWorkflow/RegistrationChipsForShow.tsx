/**
 * A dog's registrations as the show sees them: the one the show will use,
 * marked, and the others shown but de-emphasized (MYK9-569). Shared by the
 * exhibitor dog card (`DogSelectionStep`) and the staff picker's row detail
 * (`DogSelectionStepEnhanced`, MYK9-619) so the two cannot drift.
 */
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  USED_FOR_THIS_SHOW,
  registrationLabel,
  type RegistrationForShow,
} from './dogRegistrationForShow';

interface RegistrationChipsForShowProps {
  forShow: RegistrationForShow;
  className?: string;
}

export const RegistrationChipsForShow: React.FC<RegistrationChipsForShowProps> = ({
  forShow,
  className,
}) => {
  if (!forShow.used && forShow.others.length === 0) return null;

  // INTENT: the registry the show uses is decided by the show, not by the
  // exhibitor (MYK9-490). The other registrations stay VISIBLE but
  // de-emphasized — a tester read three equal chips as an unmade choice, and
  // hiding them would instead read as her dog's other numbers having been lost
  // (MYK9-569). Text size stays at text-xs: do not shrink it further (MYK9-368).
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {forShow.used && (
        <Badge
          data-registration-role="used"
          variant="outline"
          className="max-w-full whitespace-normal break-words border-primary bg-primary/10 text-xs font-semibold text-foreground"
        >
          {registrationLabel(forShow.used)}
          {/* Without a separator the accessible name runs the number into the
            marker: "SR12345601Used for this show". */}
          <span className="sr-only">, </span>
          {/* Weight, not colour, sets the marker below the number. This chip
            is a primary tint, and muted-foreground on it in dark mode sits at
            4.78:1 on a plain dog card, 4.45:1 on a selected one: the one
            muted caption in the wizard under AA (MYK9-782). */}
          <span className="ml-1.5 font-normal text-foreground">{USED_FOR_THIS_SHOW}</span>
        </Badge>
      )}
      {forShow.others.map(reg => (
        <Badge
          key={reg.id}
          data-registration-role="other"
          variant="outline"
          className={cn(
            'max-w-full whitespace-normal break-words text-xs',
            // De-emphasis is the TOKEN COLOUR only. Never opacity on text:
            // muted-foreground at 60% composites to ~2.5:1 at 12px, under the
            // 4.5:1 AA floor the token itself was fixed to meet.
            forShow.resolved && 'border-border/60 text-muted-foreground'
          )}
        >
          {registrationLabel(reg)}
        </Badge>
      ))}
    </div>
  );
};
