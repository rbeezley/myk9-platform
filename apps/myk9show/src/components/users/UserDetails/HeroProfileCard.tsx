import React from 'react';
import { Camera, Dog } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
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
  /**
   * The person is removed: the record is readable so an admin can decide whether to restore
   * it (MYK9-153), and a banner says so, so the photo control is not offered.
   */
  isRemoved?: boolean;
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
  isRemoved = false,
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
    />
  );
};

export default HeroProfileCard;
