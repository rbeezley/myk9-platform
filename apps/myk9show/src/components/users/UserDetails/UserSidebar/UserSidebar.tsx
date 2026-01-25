import React, { useCallback, useMemo, startTransition, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useUserSidebarStore } from '@/store/userSidebarStore';
import { useRoleBasedPeople } from '@/hooks/useRoleBasedData';
import { useRBAC } from '@/hooks/useRBAC';
import UnifiedSidebar from '@/components/common/UnifiedSidebar';

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

const PeopleSidebarInner: React.FC<PeopleSidebarProps> = ({
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

  const handlePersonClick = useCallback((personId: string) => {
    startTransition(() => {
      navigate(`/users/${personId}`);
    });
  }, [navigate]);

  // Memoize renderPersonItem to prevent re-renders
  const renderPersonItem = useCallback((person: PersonWithDetails, _isSelected: boolean) => {
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
  }, []);

  // Memoize getItemId callback
  const getItemId = useCallback((person: PersonWithDetails) => person.id, []);

  // Memoize getSearchText callback
  const getSearchText = useCallback((person: PersonWithDetails) => {
    const personRecord = person as unknown as Record<string, unknown>;
    const firstName = person.firstName || (personRecord.first_name as string) || '';
    const lastName = person.lastName || (personRecord.last_name as string) || '';
    return `${firstName} ${lastName} ${person.email || ''}`;
  }, []);

  // Memoize the onAdd prop to ensure stable reference
  const effectiveOnAdd = useMemo(() =>
    canManageUsers ? onAdd : undefined,
    [canManageUsers, onAdd]
  );

  // Memoize addButtonText
  const addButtonText = useMemo(() =>
    canManageUsers ? "Add User" : undefined,
    [canManageUsers]
  );

  return (
    <UnifiedSidebar<PersonWithDetails>
      items={people}
      selectedId={selectedPersonId}
      onSelect={handlePersonClick}
      onAdd={effectiveOnAdd}
      onCloseMobile={onCloseMobile}
      renderItem={renderPersonItem}
      getItemId={getItemId}
      enableSearch={true}
      searchPlaceholder="Search people..."
      getSearchText={getSearchText}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      title="People"
      subtitle="Manage people and contacts"
      headerIcon={Users}
      addButtonText={addButtonText}
      enableResize={true}
      enableVirtualization={true}
      itemHeight={56}
      className={className}
    />
  );
};

// Wrap with React.memo for performance
const PeopleSidebar = memo(PeopleSidebarInner);

export default PeopleSidebar;
