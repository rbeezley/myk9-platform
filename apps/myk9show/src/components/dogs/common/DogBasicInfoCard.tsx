import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import DogBasicInfoMenu from './DogBasicInfoMenu';
import type { Dog, Owner } from '@/types/dog-types';
import { getInitials } from '@/lib/utils';

/**
 * Formats a date string from storage format (YYYY-MM-DD) to display format (M/D/YYYY)
 * 
 * Uses direct string manipulation to avoid any timezone issues that can occur
 * with JavaScript Date objects. This ensures consistent date display across
 * the application regardless of the user's timezone.
 * 
 * @param dateStr Date string in YYYY-MM-DD format (e.g. "2025-05-21")
 * @returns Formatted date string in M/D/YYYY format (e.g. "5/21/2025")
 */
function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  
  // Only format if it's in YYYY-MM-DD format
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // Extract parts with simple string manipulation
    const [year, month, day] = dateStr.split('-');
    
    // Format as M/D/YYYY removing leading zeros
    return `${parseInt(month, 10)}/${parseInt(day, 10)}/${year}`;
  }
  
  // Return unchanged if not in expected format
  return dateStr;
}

export interface DogBasicInfoCardProps {
  dog: Dog;
  owner: Owner;
  onEdit?: () => void;
  onDelete?: () => void;
  onEditPhoto?: () => void;
}

const DogBasicInfoCard: React.FC<DogBasicInfoCardProps> = ({ dog, owner, onEdit, onDelete, onEditPhoto }) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:space-x-8 relative">
      <div className="absolute top-0 right-0 z-10 pt-1 pr-1 md:pt-3 md:pr-3"> 
        <DogBasicInfoMenu onEdit={onEdit} onDelete={onDelete} onEditPhoto={onEditPhoto} />
      </div>
      <div className="flex-shrink-0 mb-4 md:mb-0">
        <Avatar 
          className="w-32 h-32 md:w-40 md:h-40 border-2 border-primary/20 cursor-pointer" 
          onClick={onEditPhoto}
        >
          <AvatarImage src={dog.imageUrl} alt={dog.callName} />
          <AvatarFallback className="flex items-center justify-center bg-muted text-muted-foreground text-3xl font-semibold">
            {getInitials(dog.callName)}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-center space-x-3">
          <h2 className="text-2xl font-bold text-foreground">{dog.callName}</h2>
          <Badge variant="secondary">{dog.gender}</Badge>
        </div>
        <div className="text-muted-foreground">{dog.registrations?.[0]?.breed || 'Breed not specified'}</div>
        <div className="flex flex-wrap gap-4 mt-2">
          <div>
            <span className="font-semibold">Height:</span> {dog.height}
          </div>
          <div>
            <span className="font-semibold">Weight:</span> {dog.weight}
          </div>
          <div>
            <span className="font-semibold">DOB:</span> {dog.dateOfBirth ? 
              formatDisplayDate(dog.dateOfBirth) : 'N/A'}
          </div>
          <div>
            <span className="font-semibold">Color:</span> {dog["color"] || 'N/A'}
          </div>
          <div>
            <span className="font-semibold">Microchip:</span> {dog["microchip"] || 'N/A'}
          </div>
        </div>
        <div className="mt-2">
          <span className="font-semibold">Owner:</span> {owner.name} ({owner.email})
        </div>
      </div>
    </div>
  );
};

export default DogBasicInfoCard;
