import React, { useCallback, useMemo } from 'react';
import { User } from '@/types/dog-types';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useRBAC } from '@/hooks/useRBAC';
import ThreeDotMenu from '../common/ThreeDotMenu';

interface PeopleTableProps {
  people: User[];
  onView: (person: User) => void;
  onEdit: (person: User) => void;
  onDelete: (person: User) => void;
  onManageQualifications?: (person: User) => void;
}

// Optimized row component to prevent unnecessary re-renders
const PersonRow: React.FC<{
  person: User;
  onView: (person: User) => void;
  onEdit: (person: User) => void;
  onDelete: (person: User) => void;
  onManageQualifications?: (person: User) => void;
}> = React.memo(({ person, onView, onEdit, onDelete, onManageQualifications }) => {
  const { user: currentUser } = useAuthContext();
  const { hasPermission } = useRBAC();
  
  // Check if current user can manage this person's judge qualifications
  const canManageQualifications = useMemo(() => {
    // Site admins can always edit
    if (hasPermission('admin:manage')) return true;
    
    // Show secretaries can edit judge qualifications
    if (hasPermission('show:manage')) return true;
    
    // Users can edit their own qualifications if they are judges
    if (person.id && currentUser?.id === person.id) {
      return hasPermission('judge:manage_qualifications') || hasPermission('user:update');
    }
    
    return false;
  }, [hasPermission, person.id, currentUser?.id]);
  // Memoize dog count to avoid re-computation on every render
  const dogCount = useMemo(() => 
    person.dogs?.length || 0, 
    [person.dogs]
  );

  // Use useCallback to memoize event handlers and prevent child re-renders
  const handleView = useCallback(() => onView(person), [onView, person]);
  const handleEdit = useCallback(() => onEdit(person), [onEdit, person]);
  const handleDelete = useCallback(() => onDelete(person), [onDelete, person]);
  const handleManageQualifications = useCallback(() => onManageQualifications?.(person), [onManageQualifications, person]);

  // Handle both camelCase and snake_case field names for name display
  const personRecord = person as unknown as Record<string, unknown>;
  const firstName = person.firstName || (personRecord.first_name as string) || '';
  const lastName = person.lastName || (personRecord.last_name as string) || '';
  const fullName = firstName && lastName ? `${firstName} ${lastName}` : person.email || 'Unknown User';

  return (
    <tr key={person.id}>
      <td>
        <div className="flex flex-col">
          <div className="font-medium">{fullName}</div>
          {person.roles && person.roles.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {person.roles.map((role) => (
                <span 
                  key={role} 
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary"
                >
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </span>
              ))}
            </div>
          )}
        </div>
      </td>
      <td>{person.email}</td>
      <td>{person.phone}</td>
      <td>{dogCount > 0 ? `${dogCount} dog${dogCount === 1 ? '' : 's'}` : 'No dogs'}</td>
      <td>
        <ThreeDotMenu
          onView={handleView}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onManageQualifications={canManageQualifications ? handleManageQualifications : undefined}
          showManageQualifications={canManageQualifications}
        />
      </td>
    </tr>
  );
});

PersonRow.displayName = 'PersonRow';

const UserTable: React.FC<PeopleTableProps> = ({ people, onView, onEdit, onDelete, onManageQualifications }) => {
  return (
    <div className="rounded-lg border bg-card p-4 mb-6">
      <table className="w-full">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Dogs</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {people.map(person => (
            <PersonRow
              key={person.id}
              person={person}
              onView={onView}
              onEdit={onEdit}
              onDelete={onDelete}
              {...(onManageQualifications !== undefined && { onManageQualifications })}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};

// React.memo optimization for UserTable performance
export default React.memo(UserTable, (prevProps, nextProps) => {
  // Compare people array length first (fastest check)
  if (prevProps.people.length !== nextProps.people.length) return false;
  
  // Shallow comparison of people IDs (callback props should be stable)
  for (let i = 0; i < prevProps.people.length; i++) {
    if (prevProps.people[i]?.id !== nextProps.people[i]?.id) {
      return false;
    }
  }
  
  return true;
});
