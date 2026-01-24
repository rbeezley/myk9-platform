import React from 'react';
import { PawPrint } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { useRoleBasedDogs } from '@/hooks/useRoleBasedData';
import { DogsEmptyState, EmptyState } from '@/components/common/EmptyState';

interface EmptyStateViewProps {
  /** @deprecated No longer used - sidebar collapse removed */
  isSidebarCollapsed?: boolean;
  onAddDog?: () => void;
}

const EmptyStateView: React.FC<EmptyStateViewProps> = ({ onAddDog }) => {
  const { hasRole } = useAuthContext();
  const dogs = useRoleBasedDogs();

  const isExhibitor = hasRole(UserRole.EXHIBITOR);
  const hasDogs = dogs.length > 0;

  // Show "No Dogs Yet" for exhibitors with no dogs
  if (!hasDogs && isExhibitor) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <DogsEmptyState
          isOwner={true}
          onAddDog={onAddDog}
        />
      </div>
    );
  }

  // Default: prompt to select a dog from sidebar
  return (
    <div className="flex items-center justify-center h-full p-8">
      <EmptyState
        icon={PawPrint}
        title="Select a Dog"
        description="Choose a dog from the sidebar to view their details, registrations, health records, and competition history."
        size="lg"
      />
    </div>
  );
};

export default EmptyStateView;
