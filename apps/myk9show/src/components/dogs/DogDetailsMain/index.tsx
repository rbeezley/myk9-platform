import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { useUserStore } from '@/store/userStore';
import { useAuthContext, getPrimaryRole } from '@/hooks/useAuthContext';
import Breadcrumb from '@/components/common/Breadcrumb';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { RecordPageLayout } from '@/components/layout/record';
import { getDogDisplayName, type Dog, type DogStatus, type Owner } from '@/types/dog-types';
import { useRegistrationsByDogQuery } from '@/hooks/queries/useRegistrationsDatabase';
import { useSubscriptionGate } from '@/hooks/useSubscriptionGate';
import { supabase } from '@/services/database/supabaseClient';
import '@/styles/myk9-show-details.css';

import HeroProfileCard from './HeroProfileCard';
import DogDetailsTabs from './DogDetailsTabs';
import DogDialogs from './DogDialogs';
import DogStatusDialog from '@/components/dogs/DogStatusDialog';
import { validateImageFile } from './utils';
import type { DogDetailsMainProps } from './types';

import TitleProgressCard from './sidebar/TitleProgressCard';
import TitleProgressTeaser from './sidebar/TitleProgressTeaser';
import RegistrationsCard from './sidebar/RegistrationsCard';
import AboutCard from './sidebar/AboutCard';
import OwnerContactCard from './sidebar/OwnerContactCard';

const DogDetailsMain: React.FC<DogDetailsMainProps> = ({
  dog,
  fromPerson,
  onDelete,
  onUpdate,
  isDeleting,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const people = useUserStore(state => state.people);
  const { getUserRoles } = useAuthContext();
  const userRole = getPrimaryRole(getUserRoles());
  const isSecretary = userRole === 'secretary';
  const { isPremium } = useSubscriptionGate();

  const [autoOpenAddRegistration, setAutoOpenAddRegistration] = useState(false);

  const openAddRegistration = () => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', 'registrations');
      return next;
    });
    setAutoOpenAddRegistration(true);
  };

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
  const [isPhotoDragging, setIsPhotoDragging] = useState(false);
  const [updatedDog, setUpdatedDog] = useState<Dog>(dog);
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    setUpdatedDog(dog);
  }, [dog]);

  const handlePhotoDialogOpen = (open: boolean) => {
    setIsPhotoDialogOpen(open);
    if (!open) setPhotoPreview(null);
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
      const reader = new FileReader();
      reader.onload = ev => setPhotoPreview(ev.target?.result as string);
      reader.onerror = () => toast.error('Failed to read the image file');
      reader.readAsDataURL(file);
    }
  };

  const handlePhotoSave = (preview: string | null) => {
    if (preview) setUpdatedDog({ ...updatedDog, imageUrl: preview });
    setIsPhotoDialogOpen(false);
    setPhotoPreview(null);
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

  // Right sidebar — role-aware order
  const sidebar = isSecretary ? (
    <>
      <AboutCard dog={updatedDog} />
      <OwnerContactCard owner={owner} prominent />
      <RegistrationsCard
        dog={updatedDog}
        registrationsCount={liveRegistrationsCount}
        registrations={dbRegistrations}
        onAddRegistration={openAddRegistration}
      />
    </>
  ) : (
    <>
      <AboutCard dog={updatedDog} />
      <OwnerContactCard owner={owner} />
      {isPremium ? (
        <TitleProgressCard dogId={updatedDog.id} />
      ) : (
        <TitleProgressTeaser dogName={updatedDog.callName ?? 'your dog'} />
      )}
      <RegistrationsCard
        dog={updatedDog}
        registrationsCount={liveRegistrationsCount}
        registrations={dbRegistrations}
        onAddRegistration={openAddRegistration}
      />
    </>
  );

  return (
    <>
      <RecordPageLayout
        className="py-6"
        storageKey="myk9:dog"
        breadcrumb={<Breadcrumb items={breadcrumbItems} showHomeIcon={true} />}
        hero={
          <HeroProfileCard
            dog={updatedDog}
            role={isSecretary ? 'secretary' : 'exhibitor'}
            onEditPanelOpen={() => setIsEditPanelOpen(true)}
            onPhotoDialogOpen={() => handlePhotoDialogOpen(true)}
            onDeleteDialogOpen={() => setIsDeleteDialogOpen(true)}
            onStatusDialogOpen={() => setIsStatusDialogOpen(true)}
          />
        }
        properties={[]}
        tabsContent={
          <DogDetailsTabs
            dog={updatedDog}
            autoOpenAddRegistration={autoOpenAddRegistration}
            registrationsCount={liveRegistrationsCount}
            role={isSecretary ? 'secretary' : 'exhibitor'}
          />
        }
        associationsExtra={sidebar}
      />

      <DogDialogs
        dog={updatedDog}
        isEditPanelOpen={isEditPanelOpen}
        isDeleteDialogOpen={isDeleteDialogOpen}
        isPhotoDialogOpen={isPhotoDialogOpen}
        photoPreview={photoPreview}
        isPhotoDragging={isPhotoDragging}
        showCelebration={showCelebration}
        userRole={userRole}
        people={people}
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
