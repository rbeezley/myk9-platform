import React, { useCallback, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useUserSidebarStore } from '@/store/userSidebarStore';
import { useRoleBasedPeople } from '@/hooks/useRoleBasedData';
import { useRBAC } from '@/hooks/useRBAC';
import UnifiedSidebar from '@/components/common/UnifiedSidebar';
import { cn } from '@/lib/utils';

interface PersonWithDetails {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  roles?: string[];
}

interface PeopleSidebarProps {
  selectedPersonId: string | null;
  className?: string;
  isCollapsed?: boolean;
  toggleCollapsed?: () => void;
  onAdd?: () => void;
}

const PeopleSidebar: React.FC<PeopleSidebarProps> = ({ 
  selectedPersonId,
  className,
  isCollapsed: propIsCollapsed,
  toggleCollapsed: propToggleCollapsed,
  onAdd
}) => {
  const navigate = useNavigate();
  const { searchTerm, setSearchTerm } = useUserSidebarStore();
  const people = useRoleBasedPeople();
  const { hasPermission, isLoading } = useRBAC();

  // Check if user can manage users (admin only) - only check if RBAC is loaded
  const canManageUsers = !isLoading && hasPermission('user:manage');
  
  // Debug logging
  console.log('👥 UserSidebar - isLoading:', isLoading, 'canManageUsers:', canManageUsers);
  console.log('👥 UserSidebar - onAdd prop:', !!onAdd);
  
  // Note: Automatic mock data loading removed to respect "Reset Everything" functionality
  // If you need test data, use the "Load Mock Data" button in development tools

  const handlePersonClick = useCallback((personId: string) => {
    startTransition(() => {
      navigate(`/users/${personId}`);
    });
    
    // On mobile, auto-collapse the sidebar after selection
    if (typeof window !== 'undefined' && window.innerWidth < 768 && propToggleCollapsed) {
      propToggleCollapsed();
    }
  }, [navigate, propToggleCollapsed]);

  const renderPersonItem = (person: PersonWithDetails, isSelected: boolean, isCollapsed: boolean) => {
    // Handle both camelCase and snake_case field names
    const personRecord = person as unknown as Record<string, unknown>;
    const firstName = person.firstName || (personRecord.first_name as string) || '';
    const lastName = person.lastName || (personRecord.last_name as string) || '';
    const fullName = firstName && lastName ? `${firstName} ${lastName}` : person.email || 'Unknown User';
    
    if (isCollapsed) {
      const initials = firstName && lastName 
        ? `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
        : person.email?.charAt(0).toUpperCase() || '?';
      return (
        <div
          className="flex items-center justify-center w-12 h-12 mx-auto my-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
          title={fullName}
        >
          {initials}
        </div>
      );
    }

    return (
      <div className="px-3 py-2 rounded-md">
        <div className="font-medium text-sm truncate">
          {fullName}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {person.email}
        </div>
        {person.roles && person.roles.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {person.roles.slice(0, 2).map((role) => ( // Show max 2 roles in sidebar
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

  const renderCollapsedPersonItem = (person: PersonWithDetails, isSelected: boolean) => {
    // Handle both camelCase and snake_case field names
    const personRecord = person as unknown as Record<string, unknown>;
    const firstName = person.firstName || (personRecord.first_name as string) || '';
    const lastName = person.lastName || (personRecord.last_name as string) || '';
    const fullName = firstName && lastName ? `${firstName} ${lastName}` : person.email || 'Unknown User';
    const initials = firstName && lastName 
      ? `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
      : person.email?.charAt(0).toUpperCase() || '?';
      
    return (
      <div
        className={cn(
          "flex items-center justify-center w-10 h-10 mx-auto my-1 rounded-full text-xs font-medium",
          isSelected 
            ? "bg-primary text-primary-foreground" 
            : "bg-muted text-muted-foreground hover:bg-muted/80"
        )}
        title={fullName}
      >
        {initials}
      </div>
    );
  };

  return (
    <UnifiedSidebar<PersonWithDetails>
      items={people}
      selectedId={selectedPersonId}
      onSelect={handlePersonClick}
      onAdd={canManageUsers ? onAdd : undefined}
      renderItem={renderPersonItem}
      renderCollapsedItem={renderCollapsedPersonItem}
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

export default PeopleSidebar;
