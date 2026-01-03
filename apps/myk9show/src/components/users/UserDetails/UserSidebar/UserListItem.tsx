import React from 'react';
import { cn, getInitials } from '@/lib/utils';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { User } from '@/types/dog-types';

interface PeopleListItemProps {
  person: User;
  isSelected: boolean;
  isCollapsed: boolean;
  onClick: () => void;
  toggleCollapsed?: () => void;
}

const PeopleListItem: React.FC<PeopleListItemProps> = ({
  person,
  isSelected,
  isCollapsed,
  onClick,
  toggleCollapsed
}) => {


  // Handle double click on collapsed mode to expand sidebar
  const handleDoubleClick = () => {
    if (isCollapsed && toggleCollapsed) {
      toggleCollapsed();
    }
  };

  // For collapsed state, use initials with native title tooltip
  if (isCollapsed) {
    const initials = getInitials(person.firstName, person.lastName);
    
    return (
      <div 
        className={cn(
          "flex justify-center items-center cursor-pointer transition-all duration-200 hover:bg-muted/60 dark:hover:bg-muted/30 my-2",
          isSelected ? "bg-primary/10 dark:bg-primary/20 border-l-4 border-primary" : "border-l-4 border-transparent",
        )}
        onClick={onClick}
        role="button"
        aria-selected={isSelected}
        tabIndex={0}
        title={`${person.firstName} ${person.lastName}`} // Native HTML tooltip
      >
        <div 
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center",
            isSelected ? "bg-transparent text-primary dark:text-primary-foreground" : "bg-muted text-foreground"
          )}
          onClick={(e) => {
            // Stop propagation to prevent firing both click handlers
            e.stopPropagation();
            // Only toggle if the function is provided
            if (toggleCollapsed) toggleCollapsed();
          }}
        >
          <span className="font-bold text-sm">
            {initials}
          </span>
        </div>
      </div>
    );
  }
  
  // For expanded state, show full details
  return (
    <div 
      className={cn(
        "flex items-center gap-3 px-3 py-2 cursor-pointer transition-all duration-200 hover:bg-muted/60 dark:hover:bg-muted/30 group",
        isSelected ? "bg-primary/10 dark:bg-primary/20 border-l-4 border-primary" : "border-l-4 border-transparent",
      )}
      onClick={onClick}
      onDoubleClick={handleDoubleClick}
      role="button"
      aria-selected={isSelected}
      tabIndex={0}
    >
      <Avatar className="flex-shrink-0 h-10 w-10">
        {person.profileImage ? (
          <AvatarImage src={person.profileImage} alt={`${person.firstName} ${person.lastName}`} />
        ) : (
          <AvatarFallback className={cn(
            "flex items-center justify-center bg-muted text-muted-foreground",
            isSelected && "bg-transparent text-primary dark:text-primary-foreground"
          )}>
            {getInitials(person.firstName, person.lastName)}
          </AvatarFallback>
        )}
      </Avatar>
      
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className={cn(
          "text-sm truncate",
          isSelected ? "text-primary dark:text-primary-foreground font-semibold" : "font-medium text-foreground"
        )}>
          {`${person.firstName} ${person.lastName}`}
        </p>
        <p className={cn(
          "text-xs truncate",
          isSelected ? "text-primary dark:text-primary-foreground" : "text-muted-foreground"
        )}>
          {person.email}
        </p>
      </div>
    </div>
  );
};

export default PeopleListItem;
