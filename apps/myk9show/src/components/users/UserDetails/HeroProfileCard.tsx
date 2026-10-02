import React from 'react';
import { Camera, Dog } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import ThreeDotMenu from '@/components/common/ThreeDotMenu';
import { DetailHero } from '@/components/common/DetailHero';
import { getInitials } from '@/lib/utils';
import type { User as UserType } from '@/types/dog-types';

interface HeroProfileCardProps {
  person: UserType;
  firstName: string;
  lastName: string;
  fullName: string;
  photo: string;
  onEditPhoto: () => void;
  onDelete: () => void;
  onChangeStatus?: (() => void) | undefined;
  changeStatusLabel?: string | undefined;
  changeStatusDisabled?: boolean | undefined;
  changeStatusDescription?: string | undefined;
  /**
   * The person is removed. Editing them is not an operation — the record is
   * readable so an admin can decide whether to restore it (MYK9-153), and a
   * banner says exactly that, so leaving Edit / photo / invitation live here
   * would make the banner a liar. Delete stays: for a removed person it means
   * permanent deletion, which is the other half of that decision.
   */
  isRemoved?: boolean;
  /** Send/resend a sign-in invitation (MYK9-134). Omit to hide the menu item. */
  onSendInvitation?: (() => void) | undefined;
  sendInvitationLabel?: string | undefined;
  sendInvitationDisabled?: boolean | undefined;
}

/**
 * The person's header, in the shared DetailHero (MYK9-930, decision 11): a calm
 * title, email, role badges and a dog count. The old gradient card with a 4xl
 * title and Email / Call buttons is gone: the contact card beside the tabs
 * carries both, as links.
 */
const HeroProfileCard: React.FC<HeroProfileCardProps> = ({
  person,
  firstName,
  lastName,
  fullName,
  photo,
  onEditPhoto,
  onDelete,
  onChangeStatus,
  changeStatusLabel,
  changeStatusDisabled,
  changeStatusDescription,
  isRemoved = false,
  onSendInvitation,
  sendInvitationLabel,
  sendInvitationDisabled,
}) => {
  const roles = person.roles ?? [];
  const dogCount = person.dogs?.length ?? 0;

  const avatar = (
    <button
      type="button"
      onClick={isRemoved ? undefined : onEditPhoto}
      disabled={isRemoved}
      className="relative group rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label="Edit profile photo"
    >
      <Avatar className="relative w-28 h-28 border border-border">
        {photo && photo.trim() !== '' ? (
          <AvatarImage src={photo} alt="Profile photo" className="object-cover" />
        ) : (
          <AvatarFallback className="bg-primary/10 text-2xl font-semibold text-primary">
            {getInitials(firstName, lastName)}
          </AvatarFallback>
        )}
      </Avatar>
      {!isRemoved && (
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition-colors group-hover:bg-black/40">
          <span className="rounded-full bg-card/90 p-2 text-foreground opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="h-5 w-5" />
          </span>
        </span>
      )}
    </button>
  );

  return (
    <DetailHero
      cover={avatar}
      coverClassName="w-28"
      name={fullName}
      headingLevel={1}
      subtitle={person.email || undefined}
      badges={
        roles.length > 0
          ? roles.map(role => ({
              label: role.charAt(0).toUpperCase() + role.slice(1),
              variant: 'default' as const,
            }))
          : [{ label: 'Member', variant: 'default' as const }]
      }
      metadata={
        dogCount > 0
          ? [
              {
                label: `${dogCount} dog${dogCount !== 1 ? 's' : ''}`,
                icon: <Dog className="h-4 w-4" />,
              },
            ]
          : []
      }
      /* Row-level actions. Edit person is the first item of the header Actions
         menu (MYK9-928), registered by the page only while the person is live.
         For a removed person Delete means permanent deletion, the other half of
         the restore decision, and stays. */
      secondaryActions={
        <ThreeDotMenu
          onDelete={onDelete}
          {...(onChangeStatus ? { onChangeStatus } : {})}
          {...(changeStatusLabel ? { changeStatusLabel } : {})}
          {...(changeStatusDisabled !== undefined ? { changeStatusDisabled } : {})}
          {...(changeStatusDescription ? { changeStatusDescription } : {})}
          {...(isRemoved ? {} : { onEditPhoto, onSendInvitation })}
          sendInvitationLabel={sendInvitationLabel}
          sendInvitationDisabled={sendInvitationDisabled}
        />
      }
    />
  );
};

export default HeroProfileCard;
