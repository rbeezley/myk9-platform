import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { useUserStore } from '@/store/userStore';
import { useAuthContext, getPrimaryRole } from '@/hooks/useAuthContext';
import { useCanDeleteDog } from '@/hooks/useRoleBasedData';
import { useViewerOwnsDog } from '@/hooks/useViewerOwnsDog';
import { UserRole } from '@/types/auth-types';
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { toPageHeaderCrumbs } from '@/components/common/pageHeaderCrumbs';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { getDogDisplayName, type Dog, type DogStatus, type Owner } from '@/types/dog-types';
import { useRegistrationsByDogQuery } from '@/hooks/queries/useRegistrationsDatabase';
import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@/services/LoggingService';
import '@/styles/myk9-show-details.css';

import DogHero from './DogHero';
import DogIdentityRail from './DogIdentityRail';
import DogDetailsTabs from './DogDetailsTabs';
import DogDialogs from './DogDialogs';
import DogStatusDialog from '@/components/dogs/DogStatusDialog';
import { saveDogPhoto, validateImageFile } from './utils';
import { useRouteEntryFocus } from './useRouteEntryFocus';
import { usePageEditAction } from '@/features/actions/pageEditTarget';
import DogRegistrationDialogs from '@/components/dogs/DogDetails/Registrations/DogRegistrationDialogs';
import ManageRegistrationsPanel from '@/components/dogs/DogDetails/Registrations/ManageRegistrationsPanel';
import type { DogDetailsMainProps } from './types';

const DogDetailsMain: React.FC<DogDetailsMainProps> = ({
  dog,
  fromPerson,
  onDeleteStart,
  onDeleted,
  onDeleteFailed,
  onUpdate,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const people = useUserStore(state => state.people);
  const { getUserRoles, hasRole } = useAuthContext();
  const userRole = getPrimaryRole(getUserRoles());
  // MYK9-912: the narrow secretary surface is for a secretary looking at someone
  // else's dog. A secretary who owns or co-owns the dog gets the full view.
  const viewerOwnsDog = useViewerOwnsDog(dog);
  const isSecretary = userRole === 'secretary' && !viewerOwnsDog;
  // Same check as the /people/:id route guard, so the owner is a link only for someone who can open it.
  const canOpenOwnerRecord = hasRole(UserRole.SECRETARY) || hasRole(UserRole.SITE_ADMIN);
  // Mirror the soft_delete_dog RPC gate so the Delete action is hidden (not
  // failed) when the user can't delete. The admin override lives in the shared
  // delete dialog.
  const canDeleteDog = useCanDeleteDog(dog.id);

  // Route-entry focus/scroll (task 3.8, design.md Decision 10): a dog-card
  // click or a Career/Records deep link lands on the main heading; browser
  // Back/Forward is left untouched. See useRouteEntryFocus for the guard.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useRouteEntryFocus(headingRef, dog.id);

  const [addRegistrationDogId, setAddRegistrationDogId] = useState<string | null>(null);
  const [isManageRegistrationsOpen, setIsManageRegistrationsOpen] = useState(false);

  // DogDetailPage carries no key={id}, so Back/Forward between two dogs reuses
  // this component. Without this the panel stays open over a dog the user never
  // opened it for — the same leak the store-backed panels are reset for.
  useEffect(() => {
    setIsManageRegistrationsOpen(false);
  }, [dog.id]);

  // The rail's "Add registration" is the ordinary path into the add panel; the
  // Manage panel carries its own Add for when the rail is behind its backdrop.
  // It does NOT navigate: the panel is hosted by the page, so opening it from
  // Career or Records no longer needs Overview, and rewriting section/view
  // behind the modal would strand the user somewhere else on close.
  const openAddRegistration = () => setAddRegistrationDogId(dog.id);

  // Consume `?addRegistration=true` and strip it so a refresh or Back does not
  // re-raise the panel. Only that param: the panel is page-hosted, so whatever
  // section the link pointed at stays selected underneath it.
  useEffect(() => {
    if (searchParams.get('addRegistration') !== 'true') return;
    const next = new URLSearchParams(searchParams);
    next.delete('addRegistration');
    setAddRegistrationDogId(dog.id);
    setSearchParams(next, { replace: true });
  }, [dog.id, searchParams, setSearchParams]);

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
  // Edit dog is the first item of the header Actions menu (MYK9-928). The page shows the
  // dog to its viewer only once access is checked, and the secretary's rail button and
  // the exhibitor's menu item this replaces had no narrower gate.
  usePageEditAction({ kind: 'dog', enabled: true, run: () => setIsEditPanelOpen(true) });
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

  // Stable identity: this is passed to the rail AND, through DogDialogs, into
  // DogEditPanel's context memo — an inline arrow would give that memo a new
  // object on every render of this page.
  const openStatusDialog = useCallback(() => setIsStatusDialogOpen(true), []);

  const breadcrumbItems = useBreadcrumb({
    currentPage: 'dog',
    dog: updatedDog,
    fromPerson,
  });

  // The rail is the only registration summary on the page, so it has to carry
  // the failure too: without `isError`, an errored read looks exactly like an
  // empty one and the dog reads as having no registrations.
  const {
    data: dbRegistrations,
    isError: registrationsFailed,
    isLoading: registrationsLoading,
    refetch: refetchRegistrations,
  } = useRegistrationsByDogQuery(updatedDog.id);

  return (
    <>
      <PageShell>
        <PageHeader
          breadcrumbs={toPageHeaderCrumbs(breadcrumbItems, `/dogs/${updatedDog.id}`)}
          title={getDogDisplayName(updatedDog)}
          omitTitle
        />
        <DogHero
          dog={updatedDog}
          onPhotoDialogOpen={() => handlePhotoDialogOpen(true)}
          onDeleteDialogOpen={() => setIsDeleteDialogOpen(true)}
          onStatusDialogOpen={openStatusDialog}
          canDelete={canDeleteDog}
          headingRef={headingRef}
        />
        {/* Identity rail beside the content column; stacked below lg. */}
        <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-6">
          <DogIdentityRail
            dog={updatedDog}
            owner={owner}
            registrations={dbRegistrations}
            onAddRegistration={openAddRegistration}
            onManageRegistrations={() => setIsManageRegistrationsOpen(true)}
            registrationsFailed={registrationsFailed}
            registrationsLoading={registrationsLoading}
            onRetryRegistrations={() => void refetchRegistrations()}
            role={isSecretary ? 'secretary' : 'exhibitor'}
            canOpenOwnerRecord={canOpenOwnerRecord}
          />
          <main className="flex-1 min-w-0">
            <DogDetailsTabs dog={updatedDog} role={isSecretary ? 'secretary' : 'exhibitor'} />
          </main>
        </div>
      </PageShell>

      {/* ORDER IS LOAD-BEARING. SlideOverPanel does not portal and its root is
          `fixed inset-0 z-50`, so among equal-z siblings the LATER one paints on
          top. The Add/Edit/Delete panels are raised FROM the Manage panel, so
          they must come after it or they mount invisibly behind its backdrop —
          and since Overview no longer carries a registrations list, that is the
          exhibitor's only route to edit or delete one. Pinned by a DOM-order
          test in ownerResolution.test.tsx. */}
      {!isSecretary && (
        <ManageRegistrationsPanel
          open={isManageRegistrationsOpen}
          onClose={() => setIsManageRegistrationsOpen(false)}
          dog={updatedDog}
        />
      )}
      {/* Mounted once, for every role: the rail's Add, the list's per-row Edit
          and Delete, and the `?addRegistration=true` deep link all raise these,
          so they must not depend on any list being on screen. */}
      <DogRegistrationDialogs
        dog={updatedDog}
        autoOpenAddDialog={addRegistrationDogId === dog.id}
        onAddRequestConsumed={() => setAddRegistrationDogId(null)}
      />

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
        onEditPanelClose={() => setIsEditPanelOpen(false)}
        onDeleteDialogClose={() => setIsDeleteDialogOpen(false)}
        onStatusDialogOpen={openStatusDialog}
        onDeleteStart={onDeleteStart}
        onDeleted={onDeleted}
        onDeleteFailed={onDeleteFailed}
        onUpdate={onUpdate}
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
