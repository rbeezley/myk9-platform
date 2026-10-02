/**
 * DogHero — the dog's identity in the shared DetailHero (MYK9-930, audit H9):
 * photo, call name as the page's h1, registered name, sex and status badges.
 *
 * The status badge is also the control that changes it. Everything below the
 * hero (breed, born, registry table, owner) stays in DogIdentityRail.
 */

import React from 'react';
import type { RefObject } from 'react';
import { Camera, Pencil } from 'lucide-react';
import ThreeDotMenu from '@/components/common/ThreeDotMenu';
import { DetailHero } from '@/components/common/DetailHero';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn, getInitials } from '@/lib/utils';
import { badgeVariants } from '@/utils/badgeVariants';
import { getDogDisplayName, getDogRegisteredName, type Dog } from '@/types/dog-types';
import { DOG_STATUS_BADGES, getDogSexBadge } from '@/components/dogs/common/dogStatusBadges';
import { formatDisplayDate } from './utils';

interface DogHeroProps {
  dog: Dog;
  onPhotoDialogOpen: () => void;
  onDeleteDialogOpen: () => void;
  /** Required: the status badge itself is a button that raises the dialog. */
  onStatusDialogOpen: () => void;
  /** When false, the Delete action is hidden (user fails the delete permission gate). */
  canDelete?: boolean;
  /** Route-entry focus target (task 3.8): the page's main heading. */
  headingRef?: RefObject<HTMLHeadingElement | null>;
}

const DogHero: React.FC<DogHeroProps> = ({
  dog,
  onPhotoDialogOpen,
  onDeleteDialogOpen,
  onStatusDialogOpen,
  canDelete = true,
  headingRef,
}) => {
  const registeredName = getDogRegisteredName(dog);
  const sexBadge = getDogSexBadge(dog.sex);
  const statusBadge = DOG_STATUS_BADGES[dog.status || 'active'];
  const deceasedSuffix =
    dog.status === 'deceased' && dog.deceasedDate
      ? ` — ${formatDisplayDate(dog.deceasedDate)}`
      : '';

  const photo = (
    <div className="relative h-28 w-28">
      <Avatar className="h-28 w-28">
        {dog.imageUrl ? (
          <AvatarImage
            src={dog.imageUrl}
            alt={`${dog.callName}'s photo`}
            className="object-cover"
          />
        ) : (
          <AvatarFallback className="bg-primary/10 text-4xl font-semibold text-primary">
            {getInitials(dog.callName)}
          </AvatarFallback>
        )}
      </Avatar>
      <button
        type="button"
        onClick={onPhotoDialogOpen}
        aria-label="Edit dog photo"
        className="absolute -right-1 -bottom-1 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Camera className="h-5 w-5" />
      </button>
    </div>
  );

  return (
    <DetailHero
      cover={photo}
      coverClassName="w-28"
      name={getDogDisplayName(dog)}
      headingLevel={1}
      headingRef={headingRef}
      subtitle={registeredName ? <span className="italic">{registeredName}</span> : undefined}
      headerActions={
        <>
          {sexBadge && (
            <Badge variant="secondary" className={sexBadge.className}>
              {sexBadge.label}
            </Badge>
          )}
          {statusBadge && (
            /* The badge announces the lifecycle state, so it is also the control
               that changes it. The ThreeDotMenu item opens the same dialog, kept
               for parity with the card's other actions. */
            <button
              type="button"
              onClick={onStatusDialogOpen}
              aria-haspopup="dialog"
              title="Change status"
              className={cn(
                badgeVariants({ variant: 'secondary' }),
                statusBadge.className,
                // `badgeVariants`' base ring is on `:focus`, written for a <div>
                // that can never match it. Live on a real <button>, that would
                // leave a ring behind after a mouse click.
                'min-h-11 min-w-11 cursor-pointer hover:brightness-110 focus:ring-0',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
              )}
            >
              {statusBadge.label}
              {deceasedSuffix}
              <Pencil className="ml-1 h-3 w-3" aria-hidden="true" />
              <span className="sr-only"> — change status</span>
            </button>
          )}
        </>
      }
      secondaryActions={
        <ThreeDotMenu
          onEditPhoto={onPhotoDialogOpen}
          onChangeStatus={onStatusDialogOpen}
          onDelete={canDelete ? onDeleteDialogOpen : undefined}
          triggerClassName="h-11 w-11 rounded-full border border-border bg-card text-foreground shadow-sm hover:bg-accent"
        />
      }
    />
  );
};

export default DogHero;
