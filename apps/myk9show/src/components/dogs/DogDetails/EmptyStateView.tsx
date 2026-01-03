import React from 'react';
import { PawPrint, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useResizableSidebar } from '@/hooks/useResizableSidebar';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { useRoleBasedDogs } from '@/hooks/useRoleBasedData';

interface EmptyStateViewProps {
  isSidebarCollapsed: boolean;
}

const EmptyStateView: React.FC<EmptyStateViewProps> = ({ isSidebarCollapsed }) => {
  const { toggleCollapsed } = useResizableSidebar();
  const { hasRole } = useAuthContext();
  const dogs = useRoleBasedDogs();
  
  const isExhibitor = hasRole(UserRole.EXHIBITOR);
  const hasDogs = dogs.length > 0;

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="bg-muted/50 rounded-full p-6 mb-6">
        <PawPrint className="h-12 w-12 text-muted-foreground" />
      </div>
      
      <h2 className="text-2xl font-semibold mb-2">
        {!hasDogs && isExhibitor ? 'No Dogs Yet' : 'No Dog Selected'}
      </h2>
      
      <p className="text-muted-foreground mb-6 max-w-md">
        {!hasDogs && isExhibitor 
          ? "You haven't registered any dogs yet. Add your first dog to get started!"
          : "Select a dog from the sidebar to view their details, registrations, and other information."
        }
      </p>
      
      {!hasDogs && isExhibitor ? (
        <Button 
          variant="default" 
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Your First Dog
        </Button>
      ) : isSidebarCollapsed && hasDogs && (
        <Button 
          variant="outline" 
          onClick={toggleCollapsed}
          className="flex items-center gap-2"
        >
          <PawPrint className="h-4 w-4" />
          Show Dogs List
        </Button>
      )}
    </div>
  );
};

export default EmptyStateView;
