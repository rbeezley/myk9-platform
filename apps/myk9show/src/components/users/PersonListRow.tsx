import React from 'react';
import type { User } from '../../types';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import ThreeDotMenu from '../common/ThreeDotMenu';

interface PersonListRowProps {
  person: User;
  onView: () => void;
  onEdit: () => void;
  onEditPhoto?: () => void;
  onDelete: () => void;
}

const PersonListRow: React.FC<PersonListRowProps> = ({
  person,
  onView,
  onEdit,
  onEditPhoto,
  onDelete,
}) => {
  return (
    <div className="flex items-center bg-card rounded-lg shadow-sm border px-4 py-3 mb-2">
      {/* Photo */}
      <div className="flex-shrink-0">
        <Avatar className="w-16 h-16 mr-4">
          <AvatarImage
            src={person.profileImage || '/placeholder-person.png'}
            alt={person.firstName}
            className="object-cover object-top"
          />
          <AvatarFallback>{person.firstName?.[0] ?? '?'}</AvatarFallback>
        </Avatar>
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-lg text-foreground">
            {person.firstName} {person.lastName}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-1">
          {person.email && (
            <span>
              Email:{' '}
              <span className="text-blue-700 dark:text-blue-300 font-medium">{person.email}</span>
            </span>
          )}
          {person.phone && (
            <span>
              Phone: <span className="text-foreground font-medium">{person.phone}</span>
            </span>
          )}
        </div>
      </div>
      {/* Actions */}
      <div className="flex-shrink-0 ml-4">
        <ThreeDotMenu
          onView={onView}
          onEdit={onEdit}
          onEditPhoto={onEditPhoto}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
};

export default PersonListRow;
