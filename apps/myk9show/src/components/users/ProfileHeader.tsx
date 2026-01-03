import React from 'react';
import { Card } from '../ui/card';
import ThreeDotMenu from '../common/ThreeDotMenu';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { getInitials, cn } from '@/lib/utils';
import { Camera } from 'lucide-react';

interface ProfileHeaderProps {
  name: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  photoAltText?: string;
  roles?: string[];
  email?: string;
  onEditPhoto: () => void;
  onEditProfile: () => void;
  onDeleteProfile: () => void;
  cardClassName?: string;
  hideMenu?: boolean;
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({ name, firstName, lastName, photoUrl, photoAltText = "Profile photo", roles, email, onEditPhoto, onEditProfile, onDeleteProfile, cardClassName, hideMenu = false }) => {
  return (
    <Card className={`relative flex flex-col items-center justify-center p-6 ${cardClassName || ''}`}>
      {/* 3-dot menu */}
      {!hideMenu && (
        <div className="absolute top-4 right-4 z-10">
          <ThreeDotMenu
            onEdit={onEditProfile}
            onDelete={onDeleteProfile}
            onEditPhoto={onEditPhoto}
          />
        </div>
      )}
      <button 
        type="button"
        onClick={onEditPhoto}
        className="relative rounded-full group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label="Edit profile photo"
      >
        <Avatar key={`${name}-${photoUrl || 'no-photo'}`} className="w-32 h-32 md:w-40 md:h-40 border-2 border-gray-200 group-hover:opacity-75 transition-opacity ring-1 ring-border">
          {photoUrl && photoUrl.trim() !== '' ? (
            <AvatarImage src={photoUrl} alt={photoAltText} />
          ) : (
            <AvatarFallback 
              className={cn(
                "flex items-center justify-center text-muted-foreground text-5xl font-semibold",
                "bg-muted dark:bg-accent"
              )}
            >
              {getInitials(firstName, lastName)}
            </AvatarFallback>
          )}
        </Avatar>
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all rounded-full">
          <Camera className="w-10 h-10 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </button>
      <h2 className="text-2xl font-bold mt-4 mb-1">{name}</h2>
      {email && (
        <p className="text-sm text-muted-foreground mb-2">{email}</p>
      )}
      {roles && roles.length > 0 ? (
        <div className="flex flex-wrap gap-2 justify-center mb-3">
          {roles.map((role) => (
            <span 
              key={role} 
              className="text-sm px-3 py-1 rounded-full bg-primary/10 text-primary font-medium"
            >
              {role.charAt(0).toUpperCase() + role.slice(1)}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-sm text-muted-foreground bg-muted px-3 py-1 rounded-full mb-3">Member</span>
      )}
    </Card>
  );
};

export default ProfileHeader;
