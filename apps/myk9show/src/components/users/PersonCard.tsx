import React, { useCallback, useMemo } from 'react';
import EntityCardContainer from '@/components/common/EntityCardContainer';
import { Card, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
// Button removed as it's unused
// Removed unused imports
import type { User } from '../../types';
import ThreeDotMenu from '../common/ThreeDotMenu';
import { SyncStatusIndicator } from '@/components/sync/SyncStatusIndicator';
import type { SyncStatus } from '@/components/sync/SyncStatusIndicator';

interface PersonCardProps {
  person: User;
  onEdit: (person: User) => void;
  onEditPhoto?: (person: User) => void;
  onDelete: (person: User) => void;
  onView: (person: User) => void;
  syncStatus?: SyncStatus;
  lastSyncAt?: Date;
  syncErrorMessage?: string;
  showSyncStatus?: boolean;
  onSyncRetry?: () => void;
}

const getInitials = (firstName: string, lastName: string) => {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`;
};

const PersonCard: React.FC<PersonCardProps> = ({
  person,
  onEdit,
  onEditPhoto,
  onDelete,
  onView,
  syncStatus = 'synced',
  lastSyncAt,
  syncErrorMessage,
  showSyncStatus = true,
  onSyncRetry,
}) => {
  // Memoize dog badges to avoid re-creating on every render
  const dogBadges = useMemo(
    () =>
      person.dogs?.map((dogId, index) => (
        <Badge key={dogId || index} variant="secondary">
          Dog {index + 1}
        </Badge>
      )),
    [person.dogs]
  );

  // Memoize event handlers to prevent child re-renders
  const handleView = useCallback(() => onView(person), [onView, person]);
  const handleEdit = useCallback(() => onEdit(person), [onEdit, person]);
  const handleDelete = useCallback(() => onDelete(person), [onDelete, person]);
  const handleEditPhoto = useCallback(() => onEditPhoto?.(person), [onEditPhoto, person]);

  // Memoize event handlers that need event.stopPropagation()
  const handleStopPropagation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onEdit(person);
    },
    [onEdit, person]
  );
  // If this is a details page (not a list/grid), wrap in EntityCardContainer
  // For this example, let's assume PersonCard is used for details if onView is not provided
  if (!onView) {
    return (
      <EntityCardContainer>
        <div className="relative">
          {/* Menu and Sync Status */}
          <div className="absolute top-3 left-0 right-0 flex justify-between items-start px-3 z-10">
            {showSyncStatus && (
              <SyncStatusIndicator
                status={syncStatus}
                entityType="person"
                entityId={person.id}
                compact
                lastSyncAt={lastSyncAt}
                errorMessage={syncErrorMessage}
                enableActions={syncStatus === 'error' || syncStatus === 'conflict'}
                onRetry={onSyncRetry}
                className="bg-card/90 backdrop-blur-sm rounded-full p-1"
              />
            )}
            <div onClick={handleStopPropagation}>
              <ThreeDotMenu
                onEdit={handleEdit}
                onEditPhoto={onEditPhoto ? handleEditPhoto : undefined}
                onDelete={handleDelete}
              />
            </div>
          </div>

          {/* Profile Image */}
          <div className="flex flex-col items-center mb-4 pt-6">
            {person.profileImage ? (
              <img
                src={person.profileImage}
                alt={`${person.firstName} ${person.lastName}`}
                className="h-20 w-20 mb-2 rounded-full object-cover border"
              />
            ) : (
              <div className="h-20 w-20 mb-2 rounded-full bg-gray-200 flex items-center justify-center text-2xl font-bold">
                {getInitials(person.firstName, person.lastName)}
              </div>
            )}
            <h3 className="text-lg font-semibold text-center">
              {person.firstName} {person.lastName}
            </h3>
            <div className="text-sm text-gray-500 text-center">{person.email}</div>
          </div>

          {/* Associated Dogs */}
          <div className="px-4">
            <div className="flex flex-wrap gap-1 justify-center mb-2">
              {dogBadges || <span className="text-muted-foreground text-sm">No dogs</span>}
            </div>
            <div className="text-xs text-gray-400 text-center">
              {person.city}, {person.state}
            </div>
          </div>
        </div>
      </EntityCardContainer>
    );
  }

  // Compact card for list/grid variant
  return (
    <Card
      className="overflow-hidden relative max-w-sm w-full mx-auto transition-shadow transition-colors duration-200 hover:shadow-xl hover:border-blue-400 hover:border-2 cursor-pointer group"
      onClick={handleView}
      tabIndex={0}
      role="button"
      aria-label={`View details for ${person.firstName} ${person.lastName}`}
    >
      {/* Sync Status and Menu */}
      <div className="absolute top-3 left-0 right-0 flex justify-between items-start px-3 z-10">
        {showSyncStatus && (
          <SyncStatusIndicator
            status={syncStatus}
            entityType="person"
            entityId={person.id}
            compact
            lastSyncAt={lastSyncAt}
            errorMessage={syncErrorMessage}
            enableActions={syncStatus === 'error' || syncStatus === 'conflict'}
            onRetry={onSyncRetry}
            className="bg-card/90 backdrop-blur-sm rounded-full p-1"
          />
        )}
        <div onClick={handleEditClick}>
          <ThreeDotMenu
            onView={handleView}
            onEdit={handleEdit}
            onEditPhoto={onEditPhoto ? handleEditPhoto : undefined}
            onDelete={handleDelete}
          />
        </div>
      </div>
      <CardHeader className="flex flex-col items-center">
        {person.profileImage ? (
          <img
            src={person.profileImage}
            alt={`${person.firstName} ${person.lastName}`}
            className="h-20 w-20 mb-2 rounded-full object-cover border"
          />
        ) : (
          <div className="h-20 w-20 mb-2 rounded-full bg-gray-200 flex items-center justify-center text-2xl font-bold">
            {getInitials(person.firstName, person.lastName)}
          </div>
        )}
        <CardTitle className="text-lg font-semibold text-center">
          {person.firstName} {person.lastName}
        </CardTitle>
        <div className="text-sm text-gray-500 text-center">{person.email}</div>
      </CardHeader>
    </Card>
  );
};

// React.memo optimization for PersonCard performance
export default React.memo(PersonCard, (prevProps, nextProps) => {
  // Compare person object properties that affect rendering
  if (prevProps.person.id !== nextProps.person.id) return false;
  if (prevProps.person.firstName !== nextProps.person.firstName) return false;
  if (prevProps.person.lastName !== nextProps.person.lastName) return false;
  if (prevProps.person.email !== nextProps.person.email) return false;
  if (prevProps.person.profileImage !== nextProps.person.profileImage) return false;

  // Compare dogs array length
  if (prevProps.person.dogs?.length !== nextProps.person.dogs?.length) return false;

  // Compare sync status props
  if (prevProps.syncStatus !== nextProps.syncStatus) return false;
  if (prevProps.showSyncStatus !== nextProps.showSyncStatus) return false;

  // Callback props are assumed to be stable (memoized by parent)
  return true;
});
