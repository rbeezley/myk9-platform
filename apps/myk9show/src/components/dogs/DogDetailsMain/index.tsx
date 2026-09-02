import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { useUserStore } from '@/store/userStore';
import { useAuthContext, getPrimaryRole } from '@/hooks/useAuthContext';
import { useCanDeleteDog } from '@/hooks/useRoleBasedData';
import { UserRole } from '@/types/auth-types';
import Breadcrumb from '@/components/common/Breadcrumb';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { getDogDisplayName, type Dog, type DogStatus, type Owner } from '@/types/dog-types';
import { useRegistrationsByDogQuery } from '@/hooks/queries/useRegistrationsDatabase';
import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@/services/LoggingService';
import '@/styles/myk9-show-details.css';

import DogIdentityRail from './DogIdentityRail';
import DogDetailsTabs from './DogDetailsTabs';
import DogDialogs from './DogDialogs';
import DogStatusDialog from '@/components/dogs/DogStatusDialog';
import { saveDogPhoto, validateImageFile } from './utils';
import { useRouteEntryFocus } from './useRouteEntryFocus';
import type { DogDetailsMainProps } from './types';


const DogDetailsMain: React.FC<DogDetailsMainProps> = ({
  dog,
  fromPerson,
  onDelete,
  onUpdate,
  isDeleting,
}) => {
  const [searchParams] = useSearchParams();
  const people = useUserStore(state => state.people);
  const { getUserRoles, hasRole } = useAuthContext();
  const userRole = getPrimaryRole(getUserRoles());
  const isSecretary = userRole === 'secretary';
  // Mirror the soft_delete_dog RPC gate so the Delete action is hidden (not
  // failed) when the user can't delete; restore copy only shows to admins who
  // can reach the admin-only restore UI.
  const canDeleteDog = useCanDeleteDog(dog.id);
  const canRestoreDog = hasRole(UserRole.SITE_ADMIN);

  // Route-entry focus/scroll (task 3.8, design.md Decision 10): a dog-card
  // click or a Career/Records deep link lands on the main heading; browser
  // Back/Forward is left untouched. See useRouteEntryFocus for the guard.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useRouteEntryFocus(headingRef, dog.id);

  const [autoOpenAddRegistration, setAutoOpenAddRegistration] = useState(false);

  useEffect(() => {
    const shouldAddRegistration = searchParams.get('addRegistration') === 'true';
    if (shouldAddRegistration) {
      setAutoOpenAddRegistration(true);
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('addRegistration');
      window.history.replaceState({}, '', newUrl.toString());
    }
  }, [searchParams]);

  // Owner — try store first, fall back to Supabase query
  const storeOwner: Owner | null = React.useMemo(() => {
    const person = people.find(p => p.id === dog.ownerId);
    return person
      ? {
          id: person.id,
          name: `${person.firstName} ${person.lastName}`,
          email: person.email,
          phone: person.phone,
          profileImage: person.profileImage,
        }
      : null;
  }, [people, dog.ownerId]);

  const ownerQueryEnabled = !!dog.ownerId && storeOwner === null;
  const { data: fetchedOwner, isError: ownerFetchErrored } = useQuery({
    queryKey: ['person', dog.ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('people')
        .select('id, first_name, last_name, email, phone')
        .eq('id', dog.ownerId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: ownerQueryEnabled,
  });

  const owner: Owner = React.useMemo(() => {
    if (storeOwner) return storeOwner;
    if (fetchedOwner) {
      return {
        id: fetchedOwner.id,
        name: `${fetchedOwner.first_name} ${fetchedOwner.last_name}`,
        email: fetchedOwner.email ?? undefined,
        phone: fetchedOwner.phone ?? undefined,
      };
    }
    // Distinguish in-flight fetch from genuine no-owner. Without this the
    // card flashes "Unknown Owner" while the people-table query is pending,
    // which misleads users into thinking the dog has no owner on file.
    if (ownerQueryEnabled && !ownerFetchErrored) {
      return { id: 'loading', name: 'Loading…', email: '', phone: '' };
    }
    return { id: 'unknown', name: 'Unknown Owner', email: 'N/A', phone: 'N/A' };
  }, [storeOwner, fetchedOwner, ownerQueryEnabled, ownerFetchErrored]);

  // Dialog state
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isPhotoDialogOpen, setIsPhotoDialogOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  // The raw File is what we upload to Storage; photoPreview is only the data-URL
  // shown in the dialog. Keeping just the preview was the original bug.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isPhotoDragging, setIsPhotoDragging] = useState(false);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);
  const savingPhotoRef = useRef(false);
  const [updatedDog, setUpdatedDog] = useState<Dog>(dog);
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    setUpdatedDog(dog);
  }, [dog]);

  const handlePhotoDialogOpen = (open: boolean) => {
    setIsPhotoDialogOpen(open);
    if (!open) {
      setPhotoPreview(null);
      setPhotoFile(null);
    }
  };

  const handlePhotoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsPhotoDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      const validation = validateImageFile(file);
      if (!validation.valid) {
        toast.error(validation.error);
        return;
      }
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onload = ev => setPhotoPreview(ev.target?.result as string);
      reader.onerror = () => toast.error('Failed to read the image file');
      reader.readAsDataURL(file);
    }
  };

  const handlePhotoDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsPhotoDragging(true);
  };

  const handlePhotoDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsPhotoDragging(false);
  };

  const handlePhotoFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validation = validateImageFile(file);
      if (!validation.valid) {
        toast.error(validation.error);
        e.target.value = '';
        return;
      }
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onload = ev => setPhotoPreview(ev.target?.result as string);
      reader.onerror = () => toast.error('Failed to read the image file');
      reader.readAsDataURL(file);
    }
  };

  // Upload the selected file to Storage and persist the URL to the dog row.
  // Returns true only when the photo is actually saved, so the dialog can gate
  // its success toast/celebration on a real save instead of a no-op.
  const handlePhotoSave = async (): Promise<boolean> => {
    if (!photoFile) {
      toast.error('No photo selected');
      return false;
    }
    if (savingPhotoRef.current) return false;
    savingPhotoRef.current = true;
    setIsSavingPhoto(true);
    try {
      const result = await saveDogPhoto({
        ownerId: updatedDog.ownerId,
        dogId: updatedDog.id,
        file: photoFile,
        onUpdate,
      });
      if (!result.success || !result.dog) {
        toast.error(result.error ?? 'Failed to update photo. Please try again.');
        return false;
      }
      setUpdatedDog(result.dog);
      setIsPhotoDialogOpen(false);
      setPhotoPreview(null);
      setPhotoFile(null);
      return true;
    } catch (error) {
      logger.error('Dog photo save failed', 'dogs', { dogId: updatedDog.id }, error as Error);
      toast.error('Failed to update photo. Please try again.');
      return false;
    } finally {
      savingPhotoRef.current = false;
      setIsSavingPhoto(false);
    }
  };

  const handleStatusSave = async (status: DogStatus, deceasedDate?: string) => {
    if (onUpdate) {
      const result = await onUpdate(updatedDog.id, { status, deceasedDate });
      if (result) {
        setUpdatedDog(prev => ({ ...prev, status, deceasedDate }));
        toast.success(`Status updated to ${status}`);
      }
    }
  };

  const breadcrumbItems = useBreadcrumb({
    currentPage: 'dog',
    dog: updatedDog,
    fromPerson,
  });

  // Live registrations count
  const { data: dbRegistrations } = useRegistrationsByDogQuery(updatedDog.id);
  const liveRegistrationsCount = dbRegistrations?.length ?? updatedDog.registrations?.length ?? 0;

  return (
    <>
      <div className="max-w-[1440px] mx-auto py-6">
        <div className="px-6 py-3">
          <Breadcrumb items={breadcrumbItems} showHomeIcon={true} />
        </div>
        {/* Identity rail beside the content column; stacked below lg. */}
        <div className="flex flex-col lg:flex-row lg:items-start gap-6 px-6 pb-8">
          <DogIdentityRail
            dog={updatedDog}
            owner={owner}
            registrations={dbRegistrations}
            role={isSecretary ? 'secretary' : 'exhibitor'}
            onEditPanelOpen={() => setIsEditPanelOpen(true)}
            onPhotoDialogOpen={() => handlePhotoDialogOpen(true)}
            onDeleteDialogOpen={() => setIsDeleteDialogOpen(true)}
            onStatusDialogOpen={() => setIsStatusDialogOpen(true)}
            canDelete={canDeleteDog}
            headingRef={headingRef}
          />
          <main className="flex-1 min-w-0">
            <DogDetailsTabs
              dog={updatedDog}
              autoOpenAddRegistration={autoOpenAddRegistration}
              registrationsCount={liveRegistrationsCount}
              role={isSecretary ? 'secretary' : 'exhibitor'}
            />
          </main>
        </div>
      </div>

      <DogDialogs
        dog={updatedDog}
        isEditPanelOpen={isEditPanelOpen}
        isDeleteDialogOpen={isDeleteDialogOpen}
        isPhotoDialogOpen={isPhotoDialogOpen}
        photoPreview={photoPreview}
        isPhotoDragging={isPhotoDragging}
        isSavingPhoto={isSavingPhoto}
        showCelebration={showCelebration}
        userRole={userRole}
        people={people}
        canRestore={canRestoreDog}
        onEditPanelClose={() => setIsEditPanelOpen(false)}
        onDeleteDialogClose={() => setIsDeleteDialogOpen(false)}
        onDelete={onDelete}
        onUpdate={onUpdate}
        isDeleting={isDeleting ?? false}
        onPhotoDialogOpen={handlePhotoDialogOpen}
        onPhotoDrop={handlePhotoDrop}
        onPhotoDragOver={handlePhotoDragOver}
        onPhotoDragLeave={handlePhotoDragLeave}
        onPhotoFileInput={handlePhotoFileInput}
        onPhotoSave={handlePhotoSave}
        onSetUpdatedDog={setUpdatedDog}
        onSetShowCelebration={setShowCelebration}
        onSetRecentUpdate={() => {}}
        onSetIsEditPanelOpen={setIsEditPanelOpen}
      />

      <DogStatusDialog
        open={isStatusDialogOpen}
        onOpenChange={setIsStatusDialogOpen}
        dogName={getDogDisplayName(updatedDog)}
        currentStatus={updatedDog.status || 'active'}
        currentDeceasedDate={updatedDog.deceasedDate}
        onSave={handleStatusSave}
      />
    </>
  );
};

export default DogDetailsMain;
