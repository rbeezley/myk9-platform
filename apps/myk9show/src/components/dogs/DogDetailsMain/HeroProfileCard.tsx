import React from 'react';
import { Camera, Plus, CheckCheck, Pencil } from 'lucide-react';
import ThreeDotMenu from '@/components/common/ThreeDotMenu';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { formatDisplayDate } from './utils';
import type { HeroProfileCardProps } from './types';

const HeroProfileCard: React.FC<HeroProfileCardProps> = ({
  dog,
  role,
  onEditPanelOpen,
  onPhotoDialogOpen,
  onDeleteDialogOpen,
  onStatusDialogOpen,
}) => {
  const isSecretary = role === 'secretary';

  // Registered name: use the first registration's registeredName if available
  const registeredName = dog.registrations?.find(r => r.registeredName)?.registeredName ?? null;

  // Age computed from DOB
  const age = dog.dateOfBirth
    ? (() => {
        const diff = Date.now() - new Date(dog.dateOfBirth).getTime();
        const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
        return years === 1 ? '1 yr old' : `${years} yrs old`;
      })()
    : null;

  const gender = dog.gender ? dog.gender.charAt(0).toUpperCase() + dog.gender.slice(1) : null;

  return (
    <Card className="p-6 shadow-sm">
      <div className="flex items-center gap-6 flex-wrap">
        {/* Photo */}
        <button
          type="button"
          onClick={onPhotoDialogOpen}
          className="relative group flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 rounded-full"
          aria-label="Edit dog photo"
        >
          <Avatar className="w-20 h-20 border border-border">
            {dog.imageUrl ? (
              <AvatarImage
                src={dog.imageUrl}
                alt={`${dog.callName}'s photo`}
                className="object-cover"
              />
            ) : (
              <AvatarFallback className="bg-muted text-xl font-semibold text-muted-foreground">
                {getInitials(dog.callName)}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors rounded-full">
            <Camera className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </button>

        {/* Name + chips */}
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{dog.callName}</h1>
          {registeredName && (
            <p className="text-sm italic text-muted-foreground mt-0.5">{registeredName}</p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            {gender && (
              <Badge variant="secondary" className="text-xs font-medium">
                {gender}
              </Badge>
            )}
            {age && (
              <Badge variant="secondary" className="text-xs font-medium">
                {age}
              </Badge>
            )}
            {dog.status && dog.status !== 'active' && (
              <Badge variant="outline" className="text-xs font-medium capitalize">
                {dog.status}
                {dog.status === 'deceased' && dog.deceasedDate
                  ? ` — ${formatDisplayDate(dog.deceasedDate)}`
                  : ''}
              </Badge>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isSecretary ? (
            <Button size="sm" variant="default" className="gap-1.5">
              <CheckCheck className="h-4 w-4" />
              Verify for entry
            </Button>
          ) : (
            <Button size="sm" variant="default" className="gap-1.5" asChild>
              <a href="/shows">
                <Plus className="h-4 w-4" />
                Sign up for a show
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onEditPanelOpen} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <ThreeDotMenu
            onEdit={onEditPanelOpen}
            onEditPhoto={onPhotoDialogOpen}
            onChangeStatus={onStatusDialogOpen}
            onDelete={onDeleteDialogOpen}
            editLabel="Edit Dog"
            hideEdit
          />
        </div>
      </div>
    </Card>
  );
};

export default HeroProfileCard;
