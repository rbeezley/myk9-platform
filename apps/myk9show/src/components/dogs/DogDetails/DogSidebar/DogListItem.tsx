import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn, getInitials } from '@/lib/utils';
import type { Dog } from '@/types/dog-types';
import { useUserStore } from '@/store/userStore';

interface DogListItemProps {
  dog: Dog;
  isSelected: boolean;
  isCollapsed: boolean;
  onClick: () => void;
  toggleCollapsed?: () => void;
}

const DogListItem: React.FC<DogListItemProps> = ({ 
  dog, 
  isSelected, 
  isCollapsed,
  onClick,
  toggleCollapsed
}) => {
  const people = useUserStore(state => state.people);
  const owner = people.find(p => p.id === dog.ownerId);
  const ownerName = owner ? `${owner.firstName} ${owner.lastName}` : 'Unknown Owner';

  // For collapsed state, use a letter avatar with native title tooltip
  if (isCollapsed) {
    return (
      <div 
        className={cn(
          "flex justify-center items-center cursor-pointer transition-all duration-200 hover:bg-muted/60 my-2",
          isSelected ? "bg-primary/10 border-l-4 border-primary" : "border-l-4 border-transparent",
        )}
        onClick={onClick}
        role="button"
        aria-selected={isSelected}
        tabIndex={0}
        title={dog.callName} // Native HTML tooltip
      >
        <div 
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center",
            isSelected ? "bg-transparent text-primary" : "bg-muted text-foreground"
          )}
          onClick={(e) => {
            // Stop propagation to prevent firing both click handlers
            e.stopPropagation();
            // Only toggle if the function is provided
            if (toggleCollapsed) toggleCollapsed();
          }}
        >
          <span className="font-bold text-base">
            {getInitials(dog.callName)}
          </span>
        </div>
      </div>
    );
  }

  // For expanded state, show full details
  return (
    <div 
      className={cn(
        "flex items-center gap-3 px-3 py-2 cursor-pointer transition-all duration-200 hover:bg-muted/60 group",
        isSelected ? "bg-primary/10 border-l-4 border-primary" : "border-l-4 border-transparent",
      )}
      onClick={onClick}
      role="button"
      aria-selected={isSelected}
      tabIndex={0}
    >
      <Avatar className="flex-shrink-0 h-10 w-10">
        <AvatarImage src={dog.imageUrl} alt={dog.callName} />
        <AvatarFallback className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground",
          isSelected && "bg-transparent text-primary"
        )}>
          {getInitials(dog.callName)}
        </AvatarFallback>
      </Avatar>
      
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className={cn(
          "text-sm truncate",
          isSelected ? "text-primary font-semibold" : "font-medium text-foreground"
        )}>
          {dog.callName}
        </p>
        <p className={cn(
          "text-xs truncate",
          isSelected ? "text-primary" : "text-muted-foreground"
        )}>
          {ownerName}
        </p>
      </div>
    </div>
  );
};

export default DogListItem;
