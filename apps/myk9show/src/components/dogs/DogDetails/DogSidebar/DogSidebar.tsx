import React, { useCallback, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useDogSidebarStore } from '@/store/dogSidebarStore';
import { useRoleBasedDogs } from '@/hooks/useRoleBasedData';
import { useRBAC } from '@/hooks/useRBAC';
import UnifiedSidebar from '@/components/common/UnifiedSidebar';
import { cn } from '@/lib/utils';
import { logger } from '@/services/LoggingService';

interface DogWithDetails {
  id: string;
  callName?: string | undefined;
  registrations?: Array<{ registeredName?: string | undefined; breed?: string | undefined }> | undefined;
}

interface DogSidebarProps {
  selectedDogId: string | null;
  className?: string;
  isCollapsed?: boolean;
  toggleCollapsed?: () => void;
  onAdd?: () => void;
  onCloseMobile?: () => void;
}

const DogSidebar: React.FC<DogSidebarProps> = ({
  selectedDogId,
  className,
  isCollapsed: propIsCollapsed,
  toggleCollapsed: propToggleCollapsed,
  onAdd,
  onCloseMobile
}) => {
  const navigate = useNavigate();
  const { searchTerm, setSearchTerm } = useDogSidebarStore();
  const dogs = useRoleBasedDogs();
  const { hasPermission, isLoading } = useRBAC();

  // Check if user can create dogs - only check if RBAC is loaded
  const canCreateDogs = !isLoading && hasPermission('dog:create');
  
  // Debug logging
  logger.debug('🐕 DogSidebar - isLoading:', 'dogs', { isLoading, canCreateDogs });
  logger.debug('🐕 DogSidebar - onAdd prop:', 'dogs', { data: !!onAdd });

  // Helper function to get the first breed from registrations
  const getFirstBreed = (dog: DogWithDetails): string => {
    if (!dog.registrations || dog.registrations.length === 0) {
      return 'No registrations';
    }
    const firstBreed = dog.registrations[0]?.breed;
    return firstBreed || 'Breed not specified';
  };

  const handleDogClick = useCallback((dogId: string) => {
    startTransition(() => {
      navigate(`/dogs/${dogId}`);
    });
    
    // On mobile, auto-collapse the sidebar after selection
    if (typeof window !== 'undefined' && window.innerWidth < 768 && propToggleCollapsed) {
      propToggleCollapsed();
    }
  }, [navigate, propToggleCollapsed]);

  const renderDogItem = (dog: DogWithDetails, _isSelected: boolean, isCollapsed: boolean) => {
    if (isCollapsed) {
      const initials = dog.callName ? dog.callName.substring(0, 2).toUpperCase() : 'D';
      return (
        <div
          className="flex items-center justify-center w-12 h-12 mx-auto my-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
          title={dog.callName || 'Dog'}
        >
          {initials}
        </div>
      );
    }

    return (
      <div className="px-4 py-3 mx-2 my-1 rounded-xl transition-all duration-300">
        <div className="font-medium text-sm truncate">
          {dog.callName || 'Unnamed Dog'}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {getFirstBreed(dog)}
        </div>
        {dog.registrations && dog.registrations.length > 0 && (
          <div className="text-xs text-muted-foreground truncate mt-0.5 opacity-80">
            {dog.registrations[0].registeredName}
          </div>
        )}
      </div>
    );
  };

  const renderCollapsedDogItem = (dog: DogWithDetails, isSelected: boolean) => {
    const initials = dog.callName ? dog.callName.substring(0, 1).toUpperCase() : 'D';
    return (
      <div
        className={cn(
          "flex items-center justify-center w-10 h-10 mx-auto my-1 rounded-full text-xs font-medium transition-all duration-300 backdrop-blur-sm shadow-sm",
          isSelected 
            ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg scale-110" 
            : "bg-gradient-to-br from-muted/80 to-muted/60 text-muted-foreground hover:bg-gradient-to-br hover:from-primary/20 hover:to-primary/10 hover:scale-105"
        )}
        title={dog.callName || 'Dog'}
      >
        {initials}
      </div>
    );
  };

  return (
    <UnifiedSidebar<DogWithDetails>
      items={dogs}
      selectedId={selectedDogId}
      onSelect={handleDogClick}
      onAdd={canCreateDogs ? onAdd : undefined}
      onCloseMobile={onCloseMobile}
      renderItem={renderDogItem}
      renderCollapsedItem={renderCollapsedDogItem}
      getItemId={(dog) => dog.id}
      enableSearch={true}
      searchPlaceholder="Search dogs..."
      getSearchText={(dog) => `${dog.callName || ''} ${getFirstBreed(dog)} ${dog.registrations?.map((r) => r.registeredName).join(' ') || ''}`}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      title="Dogs"
      subtitle="Manage your dogs and profiles"
      headerIcon={Heart}
      addButtonText={canCreateDogs ? "Add Dog" : undefined}
      enableCollapse={true}
      isCollapsed={propIsCollapsed}
      onToggleCollapse={propToggleCollapsed}
      enableResize={true}
      enableVirtualization={true}
      itemHeight={56}
      className={className}
    />
  );
};

export default DogSidebar;
