import React from 'react';
import { Dog } from '../../types/dog-types';
import { Card } from '../ui/card';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu';
import { MoreVertical, Eye, Edit, Trash2, Camera, FileText, Plus, List } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getInitials, cn } from '@/lib/utils';
import { getOrganizationBadge } from '@/utils/registrationUtils';

interface DogCardProps {
  dog: Dog;
  onViewDetails?: (id: string) => void;
  onEditDog?: (id: string) => void;
  onDeleteDog?: (id: string) => void;
  onEditDogPhoto?: (id: string) => void;
  onAddRegistration?: (id: string) => void;
}

const DogCard: React.FC<DogCardProps> = ({
  dog,
  onViewDetails,
  onEditDog,
  onDeleteDog,
  onEditDogPhoto,
  onAddRegistration,
}) => {
  // Get unique organizations from registrations
  const uniqueOrgs = Array.from(
    new Set(dog.registrations?.map(r => r.organization).filter(Boolean))
  ).slice(0, 3); // Show max 3 orgs

  return (
    <Card className="relative min-w-[300px] bg-card-secondary dark:bg-card rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700 snap-start flex-shrink-0 group">
      <div className="absolute top-3 right-3 z-50">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onViewDetails && (
              <DropdownMenuItem onClick={() => onViewDetails(dog.id)}>
                <Eye className="w-4 h-4 mr-2" /> View Details
              </DropdownMenuItem>
            )}

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FileText className="w-4 h-4 mr-2" />
                <span>Registrations</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  {onAddRegistration && (
                    <DropdownMenuItem onClick={() => onAddRegistration(dog.id)}>
                      <Plus className="w-4 h-4 mr-2" /> Add Registration
                    </DropdownMenuItem>
                  )}
                  {onViewDetails && (
                    <DropdownMenuItem onClick={() => onViewDetails(dog.id)}>
                      <List className="w-4 h-4 mr-2" /> View All Registrations
                    </DropdownMenuItem>
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            {onEditDog && (
              <DropdownMenuItem onClick={() => onEditDog(dog.id)}>
                <Edit className="w-4 h-4 mr-2" /> Edit Info
              </DropdownMenuItem>
            )}
            {onEditDogPhoto && (
              <DropdownMenuItem onClick={() => onEditDogPhoto(dog.id)}>
                <Camera className="w-4 h-4 mr-2" /> Change Photo
              </DropdownMenuItem>
            )}
            {onDeleteDog && (
              <DropdownMenuItem
                onClick={() => onDeleteDog(dog.id)}
                className="text-red-600 hover:!text-red-600 hover:!bg-red-50 dark:hover:!bg-red-900/50 dark:hover:!text-red-400 focus:!bg-red-50 dark:focus:!bg-red-900/50"
              >
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* Card Content */}
      <div className="p-4 pt-4">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="h-16 w-16">
            <AvatarImage src={dog.imageUrl} alt={dog.callName} />
            <AvatarFallback
              className={cn(
                'flex items-center justify-center text-muted-foreground text-xl font-semibold',
                'bg-muted dark:bg-accent'
              )}
            >
              {getInitials(dog.callName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h3 className="font-semibold text-lg truncate">{dog.callName}</h3>
            <p className="text-sm text-muted-foreground truncate">
              {dog.registrations?.[0]?.breed || 'No breed specified'}
            </p>
          </div>
        </div>

        {/* Registration Badges at the bottom */}
        {uniqueOrgs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border">
            {uniqueOrgs.map((org, index) => {
              const badge = getOrganizationBadge(org);
              return (
                <span
                  key={index}
                  className={`${badge.bgColor} ${badge.textColor} text-xs px-2 py-0.5 rounded-full whitespace-nowrap`}
                  title={badge.name}
                >
                  {badge.shortCode}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
};

export default DogCard;
