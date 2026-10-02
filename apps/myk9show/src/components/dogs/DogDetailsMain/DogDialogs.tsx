import React, { lazy, Suspense, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { logger } from '@/services/LoggingService';
import { DogEditPanelSkeleton, PhotoDialogSkeleton } from './Skeletons';
import { dogDeleteDetail } from '@/features/delete';
import { getDogDisplayName } from '@/types/dog-types';
import {
  convertDogToDogInput,
  formatDisplayDate,
  CELEBRATION_DURATION_MS,
  CELEBRATION_FADE_DELAY_MS,
} from './utils';
import type { DogDialogsProps } from './types';

// Lazy load heavy components
const DogEditPanel = lazy(() =>
  import('@/components/panels/edit/DogEditPanel').then(m => ({ default: m.DogEditPanel }))
);
const PhotoDialog = lazy(() => import('@/components/common/PhotoDialog'));

const DogDialogs: React.FC<DogDialogsProps> = ({
  dog,
  isEditPanelOpen,
  isPhotoDialogOpen,
  photoPreview,
  isPhotoDragging,
  isSavingPhoto,
  showCelebration: _showCelebration,
  userRole,
  people,
  onEditPanelClose,
  canDelete,
  onStatusDialogOpen,
  onDeleteStart,
  onDeleted,
  onDeleteFailed,
  onUpdate,
  onPhotoDialogOpen,
  onPhotoDrop,
  onPhotoDragOver,
  onPhotoDragLeave,
  onPhotoFileInput,
  onPhotoSave,
  onSetUpdatedDog,
  onSetShowCelebration,
  onSetRecentUpdate,
  onSetIsEditPanelOpen,
}) => {
  const celebrationTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(celebrationTimeoutRef.current);
      clearTimeout(fadeTimeoutRef.current);
    };
  }, []);

  const startCelebration = (message: string) => {
    clearTimeout(celebrationTimeoutRef.current);
    clearTimeout(fadeTimeoutRef.current);
    onSetShowCelebration(true);
    onSetRecentUpdate(message);
    celebrationTimeoutRef.current = setTimeout(() => {
      onSetShowCelebration(false);
      fadeTimeoutRef.current = setTimeout(() => onSetRecentUpdate(null), CELEBRATION_FADE_DELAY_MS);
    }, CELEBRATION_DURATION_MS);
  };

  return (
    <>
      {/* Edit Panel */}
      <Suspense fallback={<DogEditPanelSkeleton />}>
        <DogEditPanel
          open={isEditPanelOpen}
          onClose={onEditPanelClose}
          dogId={dog.id}
          dogName={dog.callName || ''}
          initialDogData={dog}
          userRole={userRole}
          people={people}
          dogStatus={dog.status}
          dogDeceasedDate={dog.deceasedDate ? formatDisplayDate(dog.deceasedDate) : undefined}
          onChangeStatus={onStatusDialogOpen}
          // Delete dog is the panel's footer button, gated like soft_delete_dog (owner,
          // co-owner or site admin). The site-admin override lives in the shared dialog.
          onDelete={
            canDelete
              ? {
                  kind: 'dog',
                  objectLabel: 'dog',
                  targets: [
                    {
                      id: dog.id,
                      name: getDogDisplayName(dog),
                      detail: dogDeleteDetail({ callName: dog.callName, ownerName: dog.ownerName }),
                    },
                  ],
                  onDeleteStart,
                  onDeleted: () => onDeleted?.(dog.id),
                  onDeleteFailed,
                }
              : undefined
          }
          onSave={async updatedDogData => {
            // Store previous state for rollback on error
            const previousDog = { ...dog };

            try {
              // Update local state immediately for UI feedback
              onSetUpdatedDog({ ...dog, ...updatedDogData });

              // Save to database if onUpdate prop is available
              if (onUpdate) {
                logger.debug('updatedDogData from edit panel', 'dogs', {
                  dogId: dog.id,
                  hasRegistrations: !!updatedDogData.registrations,
                  registrationsCount: updatedDogData.registrations?.length || 0,
                  registrations: updatedDogData.registrations,
                });
                const dogInputData = convertDogToDogInput(updatedDogData, dog);
                logger.debug('Saving dog data to database', 'dogs', {
                  dogId: dog.id,
                  dogInputData,
                });
                const savedDog = await onUpdate(dog.id, dogInputData);

                if (savedDog) {
                  // Update with the data returned from the database
                  onSetUpdatedDog(savedDog);
                  logger.debug('Dog data saved successfully', 'dogs', { dogId: savedDog.id });

                  // Show success celebration
                  startCelebration(`${dog.callName} updated!`);

                  onSetIsEditPanelOpen(false);
                } else {
                  throw new Error('No data returned from update');
                }
              } else {
                // No onUpdate prop - just close panel (local-only mode)
                onSetIsEditPanelOpen(false);
              }
            } catch (error) {
              logger.error('Failed to save dog data', 'dogs', { dogId: dog.id }, error as Error);
              // Revert optimistic update
              onSetUpdatedDog(previousDog);
              // Reject so EditPanelWrapper keeps the panel open with the user's
              // edits and reports the failure; resolving here would close it and
              // announce a save that did not happen.
              throw error;
            }
          }}
          enableAutoSave={false}
        />
      </Suspense>

      {/* Edit Photo Dialog with Personal Touch */}
      <Suspense fallback={<PhotoDialogSkeleton />}>
        <PhotoDialog
          open={isPhotoDialogOpen}
          onOpenChange={onPhotoDialogOpen}
          previewImage={photoPreview}
          currentPhoto={dog?.imageUrl || ''}
          isDragging={isPhotoDragging}
          onDrop={onPhotoDrop}
          onDragOver={onPhotoDragOver}
          onDragLeave={onPhotoDragLeave}
          onFileInput={onPhotoFileInput}
          onCancel={() => onPhotoDialogOpen(false)}
          isSaving={isSavingPhoto}
          onSave={async () => {
            // onPhotoSave uploads to Storage + persists to the DB and resolves
            // true only on a real save. Celebrate/toast success only then; the
            // handler surfaces its own error toast on failure.
            const saved = await onPhotoSave();
            if (saved) {
              toast.success('Photo updated successfully');
              startCelebration(`Photo updated for ${dog.callName}`);
            }
          }}
          title={`Update ${dog.callName}'s Photo`}
          previewAlt={`${dog?.callName}'s adorable photo`}
        />
      </Suspense>
    </>
  );
};

export default DogDialogs;
