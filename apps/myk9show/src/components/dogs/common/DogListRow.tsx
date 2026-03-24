import React from 'react';
import type { Dog } from '@/types/dog-types';
import type { User } from '@/types/user-types';
import { Badge } from '../../ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '../../ui/avatar';
import { PawPrint } from 'lucide-react';
import ThreeDotMenu from '../../common/ThreeDotMenu';

interface DogListRowProps {
  dog: Dog;
  owners: User[];
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  calculateAge: (dob?: string) => string;
  getOrganizationBadgeColor: (org: string) => string;
}

const DogListRow: React.FC<DogListRowProps> = ({
  dog,
  owners,
  onView,
  onEdit,
  onDelete,
  calculateAge,
  getOrganizationBadgeColor,
}) => {
  const owner = owners.find(o => o.id === dog.ownerId);
  return (
    <div className="flex items-center bg-card rounded-lg shadow-sm border px-4 py-3 mb-2">
      {/* Photo */}
      <div className="flex-shrink-0">
        <Avatar className="w-16 h-16 mr-4">
          <AvatarImage
            src={dog.imageUrl || '/placeholder-dog.png'}
            alt={dog.callName}
            className="object-cover object-top"
          />
          <AvatarFallback>
            {dog.callName?.[0] ?? <PawPrint className="w-8 h-8 text-gray-400" />}
          </AvatarFallback>
        </Avatar>
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-lg text-foreground">{dog.callName}</span>
          {dog.registrations?.[0]?.breed && (
            <span className="text-sm text-muted-foreground ml-2">
              Breed:{' '}
              <span className="font-medium text-foreground">{dog.registrations[0].breed}</span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-1">
          <span>
            Owner:{' '}
            <span className="text-blue-700 dark:text-blue-300 font-medium">
              {owner ? `${owner.firstName} ${owner.lastName}` : 'N/A'}
            </span>
          </span>
          <span>
            Gender:{' '}
            {dog.gender === 'Male' ? (
              <span className="text-blue-600">♂</span>
            ) : (
              <span className="text-pink-600">♀</span>
            )}{' '}
            {dog.gender}
          </span>
          <span>
            Age: {calculateAge(dog?.dateOfBirth || '')}{' '}
            {+calculateAge(dog?.dateOfBirth || '') === 1 ? 'year' : 'years'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {dog.registrations &&
            dog.registrations.map(reg => (
              <Badge
                key={reg.id}
                variant="outline"
                className={getOrganizationBadgeColor(reg.organization)}
              >
                {reg.organization}
              </Badge>
            ))}
        </div>
      </div>
      {/* Actions */}
      <div className="flex-shrink-0 ml-4">
        <ThreeDotMenu onView={onView} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  );
};

export default DogListRow;
