import React, { useCallback, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useUserSidebarStore } from '@/store/userSidebarStore';
import { useRoleBasedPeople } from '@/hooks/useRoleBasedData';
import { useRBAC } from '@/hooks/useRBAC';
import UnifiedSidebar from '@/components/common/UnifiedSidebar';
import { logger } from '@/services/LoggingService';

interface PersonWithDetails {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | undefined;
  phone?: string | undefined;
  roles?: string[] | undefined;
}

interface PeopleSidebarProps {
  selectedPersonId: string | null;
  className?: string;
  onAdd?: () => void;
  onCloseMobile?: () => void;
}

const PeopleSidebar: React.FC<PeopleSidebarProps> = ({
  selectedPersonId,
  className,
  onAdd,
  onCloseMobile
}) => {
  const navigate = useNavigate();
  const { searchTerm, setSearchTerm } = useUserSidebarStore();
  const people = useRoleBasedPeople();
  const { hasPermission, isLoading } = useRBAC();

  // Check if user can manage users (admin only) - only check if RBAC is loaded
  const canManageUsers = !isLoading && hasPermission('user:manage');
  
  // Debug logging
  logger.debug('👥 UserSidebar - isLoading:', 'users', { isLoading, canManageUsers });
  logger.debug('👥 UserSidebar - onAdd prop:', 'users', { data: !!onAdd });
  
  // Note: Automatic mock data loading removed to respect "Reset Everything" functionality
  // If you need test data, use the "Load Mock Data" button in development tools

  const handlePersonClick = useCallback((personId: string) => {
    startTransition(() => {
      navigate(`/users/${personId}`);
    });
  }, [navigate]);

  const renderPersonItem = (person: PersonWithDetails, _isSelected: boolean) => {
    // Handle both camelCase and snake_case field names
    const personRecord = person as unknown as Record<string, unknown>;
    const firstName = person.firstName || (personRecord.first_name as string) || '';
    const lastName = person.lastName || (personRecord.last_name as string) || '';
    const fullName = firstName && lastName ? `${firstName} ${lastName}` : person.email || 'Unknown User';

    return (
      <div className="px-3 py-2">
        <div className="font-medium text-sm truncate">
          {fullName}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {person.email}
        </div>
        {person.roles && person.roles.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {person.roles.slice(0, 2).map((role) => (
              <span
                key={role}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary"
              >
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </span>
            ))}
            {person.roles.length > 2 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                +{person.roles.length - 2}
              </span>
            )}
          </div>
        )}
        {person.phone && (
          <div className="text-xs text-muted-foreground truncate">
            {person.phone}
          </div>
        )}
      </div>
    );
  };

  return (
    <UnifiedSidebar<PersonWithDetails>
      items={people}
      selectedId={selectedPersonId}
      onSelect={handlePersonClick}
      onAdd={canManageUsers ? onAdd : undefined}
      onCloseMobile={onCloseMobile}
      renderItem={renderPersonItem}
      getItemId={(person) => person.id}
      enableSearch={true}
      searchPlaceholder="Search people..."
      getSearchText={(person) => {
        const personRecord = person as unknown as Record<string, unknown>;
        const firstName = person.firstName || (personRecord.first_name as string) || '';
        const lastName = person.lastName || (personRecord.last_name as string) || '';
        return `${firstName} ${lastName} ${person.email || ''}`;
      }}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      title="Users"
      subtitle="Manage people and contacts"
      headerIcon={Users}
      addButtonText={canManageUsers ? "Add User" : undefined}
      enableResize={true}
      enableVirtualization={true}
      itemHeight={56}
      className={className}
    />
  );
};

export default PeopleSidebar;
