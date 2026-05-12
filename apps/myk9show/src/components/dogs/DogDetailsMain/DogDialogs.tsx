import React, { lazy, Suspense, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { logger } from '@/services/LoggingService';
import { DogEditPanelSkeleton, PhotoDialogSkeleton } from './Skeletons';
import { DeleteDogDialog } from '@/components/dogs/common/DeleteDogDialog';
import { convertDogToDogInput, CELEBRATION_DURATION_MS, CELEBRATION_FADE_DELAY_MS } from './utils';
import type { DogDialogsProps } from './types';

// Lazy load heavy components
const DogEditPanel = lazy(() =>
  import('@/components/panels/edit/DogEditPanel').then(m => ({ default: m.DogEditPanel }))
);
const PhotoDialog = lazy(() => import('@/components/common/PhotoDialog'));

const DogDialogs: React.FC<DogDialogsProps> = ({
  dog,
  isEditPanelOpen,
  isDeleteDialogOpen,
  isPhotoDialogOpen,
  photoPreview,
  isPhotoDragging,
  showCelebration: _showCelebration,
  userRole,
  people,
  isDeleting,
  onEditPanelClose,
  onDeleteDialogClose,
  onDelete,
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

                  toast.success('Changes saved successfully');
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
              // Show error to user
              toast.error('Failed to save changes. Please try again.');
              // Keep panel open so user can retry
            }
          }}
          enableAutoSave={false}
        />
      </Suspense>

      {isDeleteDialogOpen && (
        <DeleteDogDialog
          open={isDeleteDialogOpen}
          onClose={onDeleteDialogClose}
          onDelete={async () => {
            await onDelete?.();
            onDeleteDialogClose();
          }}
          dog={dog}
          isSubmitting={isDeleting ?? false}
        />
      )}

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
          onSave={preview => {
            if (!preview) {
              toast.error('No photo selected');
              return;
            }
            try {
              onPhotoSave(preview);
              toast.success('Photo updated successfully');
              // Show celebration for photo update
              startCelebration(`Photo updated for ${dog.callName}`);
            } catch (error) {
              toast.error('Failed to update photo');
              logger.error('Photo save failed', 'dogs', { dogId: dog.id }, error as Error);
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
