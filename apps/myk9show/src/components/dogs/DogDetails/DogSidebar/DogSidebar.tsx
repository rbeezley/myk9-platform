import React, { useCallback, useMemo, startTransition, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useDogSidebarStore } from '@/store/dogSidebarStore';
import { useRoleBasedDogs } from '@/hooks/useRoleBasedData';
import { useRBAC } from '@/hooks/useRBAC';
import UnifiedSidebar from '@/components/common/UnifiedSidebar';

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

const DogSidebarInner: React.FC<DogSidebarProps> = ({
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

  const handleDogClick = useCallback((dogId: string) => {
    startTransition(() => {
      navigate(`/dogs/${dogId}`);
    });
  }, [navigate]);

  // Memoize renderDogItem to prevent re-renders
  const renderDogItem = useCallback((dog: DogWithDetails, _isSelected: boolean) => {
    const breed = dog.registrations?.[0]?.breed ||
      (dog.registrations && dog.registrations.length > 0 ? 'Breed not specified' : 'No registrations');
    return (
      <div className="px-3 py-2">
        <div className="font-medium text-sm truncate">
          {dog.callName || 'Unnamed Dog'}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {breed}
        </div>
        {dog.registrations && dog.registrations.length > 0 && (
          <div className="text-xs text-muted-foreground truncate mt-0.5 opacity-80">
            {dog.registrations[0].registeredName}
          </div>
        )}
      </div>
    );
  }, []);

  // Memoize getItemId callback
  const getItemId = useCallback((dog: DogWithDetails) => dog.id, []);

  // Memoize getSearchText callback
  const getSearchText = useCallback((dog: DogWithDetails) => {
    const breed = dog.registrations?.[0]?.breed ||
      (dog.registrations && dog.registrations.length > 0 ? 'Breed not specified' : 'No registrations');
    return `${dog.callName || ''} ${breed} ${dog.registrations?.map((r) => r.registeredName).join(' ') || ''}`;
  }, []);

  // Memoize the onAdd prop to ensure stable reference
  const effectiveOnAdd = useMemo(() =>
    canCreateDogs ? onAdd : undefined,
    [canCreateDogs, onAdd]
  );

  // Memoize addButtonText
  const addButtonText = useMemo(() =>
    canCreateDogs ? "Add Dog" : undefined,
    [canCreateDogs]
  );

  return (
    <UnifiedSidebar<DogWithDetails>
      items={dogs}
      selectedId={selectedDogId}
      onSelect={handleDogClick}
      onAdd={effectiveOnAdd}
      onCloseMobile={onCloseMobile}
      renderItem={renderDogItem}
      getItemId={getItemId}
      enableSearch={true}
      searchPlaceholder="Search dogs..."
      getSearchText={getSearchText}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      title="Dogs"
      subtitle="Manage your dogs and profiles"
      headerIcon={Heart}
      addButtonText={addButtonText}
      enableResize={true}
      enableVirtualization={true}
      itemHeight={56}
      className={className}
    />
  );
};

// Wrap with React.memo for performance - only re-render when props actually change
const DogSidebar = memo(DogSidebarInner);

export default DogSidebar;
