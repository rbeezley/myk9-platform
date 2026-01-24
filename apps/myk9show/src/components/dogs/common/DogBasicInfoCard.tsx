import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Pencil } from 'lucide-react';
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

/**
 * Renders a field value or an editable placeholder if empty
 */
const EditableField: React.FC<{
  label: string;
  value: string | undefined | null;
  onEdit: (() => void) | undefined;
  formatValue?: (val: string) => string;
}> = ({ label, value, onEdit, formatValue }) => {
  const displayValue = value ? (formatValue ? formatValue(value) : value) : null;
  const isEmpty = !displayValue;

  return (
    <div className="flex items-center gap-1">
      <span className="font-semibold">{label}:</span>
      {isEmpty ? (
        <button
          onClick={onEdit}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded",
            "text-muted-foreground hover:text-foreground",
            "bg-muted/50 hover:bg-muted",
            "transition-colors cursor-pointer",
            "text-sm italic"
          )}
          title={`Add ${label.toLowerCase()}`}
        >
          <span>Add</span>
          <Pencil className="w-3 h-3" />
        </button>
      ) : (
        <span>{displayValue}</span>
      )}
    </div>
  );
};

const DogBasicInfoCard: React.FC<DogBasicInfoCardProps> = ({ dog, owner, onEdit, onDelete, onEditPhoto }) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:space-x-8 relative">
      <div className="absolute top-0 right-0 z-10 pt-1 pr-1 md:pt-3 md:pr-3">
        <DogBasicInfoMenu onEdit={onEdit} onDelete={onDelete} onEditPhoto={onEditPhoto} />
      </div>
      {/* Photo - Circular avatar */}
      <div className="flex-shrink-0 mb-4 md:mb-0">
        <button
          onClick={onEditPhoto}
          className="relative group focus:outline-none"
        >
          <Avatar className="w-32 h-32 md:w-40 md:h-40 border-2 border-primary/20 cursor-pointer">
            <AvatarImage src={dog.imageUrl} alt={dog.callName} />
            <AvatarFallback className="flex items-center justify-center bg-muted text-muted-foreground text-3xl font-semibold">
              {getInitials(dog.callName)}
            </AvatarFallback>
          </Avatar>
          {/* Hover overlay */}
          <div className={cn(
            "absolute inset-0 flex items-center justify-center rounded-full",
            "bg-black/40 opacity-0 group-hover:opacity-100",
            "transition-opacity"
          )}>
            <Pencil className="w-6 h-6 text-white" />
          </div>
        </button>
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-center space-x-3">
          <h2 className="text-2xl font-bold text-foreground">{dog.callName}</h2>
          <Badge variant="secondary">{dog.gender}</Badge>
        </div>
        <div className="text-muted-foreground">{dog.registrations?.[0]?.breed || 'Breed not specified'}</div>
        <div className="flex flex-wrap gap-4 mt-2">
          <EditableField
            label="Height"
            value={dog.height}
            onEdit={onEdit}
          />
          <EditableField
            label="Weight"
            value={dog.weight}
            onEdit={onEdit}
          />
          <EditableField
            label="DOB"
            value={dog.dateOfBirth}
            onEdit={onEdit}
            formatValue={formatDisplayDate}
          />
          <EditableField
            label="Color"
            value={dog.color}
            onEdit={onEdit}
          />
          <EditableField
            label="Microchip"
            value={dog.microchip}
            onEdit={onEdit}
          />
        </div>
        <div className="mt-2">
          <span className="font-semibold">Owner:</span> {owner.name} ({owner.email})
        </div>
      </div>
    </div>
  );
};

export default DogBasicInfoCard;
