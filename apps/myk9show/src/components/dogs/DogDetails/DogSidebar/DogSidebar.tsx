import React, { useCallback, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useDogSidebarStore } from '@/store/dogSidebarStore';
import { useRoleBasedDogs } from '@/hooks/useRoleBasedData';
import { useRBAC } from '@/hooks/useRBAC';
import UnifiedSidebar from '@/components/common/UnifiedSidebar';
import { logger } from '@/services/LoggingService';

interface DogWithDetails {
  id: string;
  callName?: string | undefined;
  registrations?: Array<{ registeredName?: string | undefined; breed?: string | undefined }> | undefined;
}

interface DogSidebarProps {
  selectedDogId: string | null;
  className?: string;
  onAdd?: () => void;
  onCloseMobile?: () => void;
}

const DogSidebar: React.FC<DogSidebarProps> = ({
  selectedDogId,
  className,
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
  }, [navigate]);

  const renderDogItem = (dog: DogWithDetails, _isSelected: boolean) => {
    return (
      <div className="px-3 py-2">
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

  return (
    <UnifiedSidebar<DogWithDetails>
      items={dogs}
      selectedId={selectedDogId}
      onSelect={handleDogClick}
      onAdd={canCreateDogs ? onAdd : undefined}
      onCloseMobile={onCloseMobile}
      renderItem={renderDogItem}
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
      enableResize={true}
      enableVirtualization={true}
      itemHeight={56}
      className={className}
    />
  );
};

export default DogSidebar;
