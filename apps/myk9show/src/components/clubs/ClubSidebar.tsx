import React from "react";
import { Building2 } from 'lucide-react';
import { useRBAC } from '@/hooks/useRBAC';
import UnifiedSidebar from '@/components/common/UnifiedSidebar';
import { cn } from '@/lib/utils';

export interface Club {
  id: string;
  name: string;
  email: string;
  logo: string;
}

interface ClubSidebarProps {
  clubs: Club[];
  selectedClubId: string;
  onSelectClub: (id: string) => void;
  onAddClub?: () => void;
  onCloseMobile?: () => void;
}

// Utility function for club initials
const getClubInitials = (name: string) => {
  return name
    .split(' ')
    .filter(Boolean)
    .map(word => word[0].toUpperCase())
    .join('')
    .slice(0, 3);
};

const ClubSidebar: React.FC<ClubSidebarProps> = ({ clubs, selectedClubId, onSelectClub, onAddClub, onCloseMobile }) => {
  const { hasPermission, isLoading } = useRBAC();

  // Check if user can create clubs (admin only) - only check if RBAC is loaded
  const canCreateClubs = !isLoading && hasPermission('club:create');

  const renderClubItem = (club: Club, isSelected: boolean) => (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md">
      {club.logo ? (
        <img
          src={club.logo}
          alt={club.name}
          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div
          className={cn(
            "w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold",
            isSelected
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          )}
        >
          {getClubInitials(club.name)}
        </div>
      )}
      <div className="flex-grow min-w-0">
        <p className="text-sm font-semibold truncate">
          {club.name}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {club.email}
        </p>
      </div>
    </div>
  );

  return (
    <UnifiedSidebar<Club>
      items={clubs}
      selectedId={selectedClubId}
      onSelect={onSelectClub}
      onAdd={canCreateClubs ? onAddClub : undefined}
      onCloseMobile={onCloseMobile}
      renderItem={renderClubItem}
      getItemId={(club) => club.id}
      enableSearch={true}
      searchPlaceholder="Search clubs..."
      getSearchText={(club) => `${club.name} ${club.email}`}
      title="Clubs"
      subtitle="Browse and manage clubs"
      headerIcon={Building2}
      addButtonText={canCreateClubs ? "Add Club" : undefined}
    />
  );
};

export default ClubSidebar;
