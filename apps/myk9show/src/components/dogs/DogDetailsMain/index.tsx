import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Trophy, Calendar, Award, Star } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { useEntryStore } from '@/store/entryStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import Breadcrumb from '@/components/common/Breadcrumb';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { RecordStatsRow, type RecordStat } from '@/components/common/RecordStatsRow';
import { getDogDisplayName, type Dog, type DogStatus, type Owner } from '@/types/dog-types';
import '@/styles/myk9-show-details.css';

import HeroProfileCard from './HeroProfileCard';
import DogInfoCards from './DogInfoCards';
import OwnerInfoCard from './OwnerInfoCard';
import DogSummaryCard from './DogSummaryCard';
import DogDetailsTabs from './DogDetailsTabs';
import DogDialogs from './DogDialogs';
import DogStatusDialog from '@/components/dogs/DogStatusDialog';
import { validateImageFile } from './utils';
import type { DogDetailsMainProps } from './types';

const DogDetailsMain: React.FC<DogDetailsMainProps> = ({ dog, fromPerson, onDelete, onUpdate }) => {
  const [searchParams] = useSearchParams();
  const people = useUserStore(state => state.people);
  const { getUserRoles } = useAuthContext();
  const userRole = getUserRoles()[0]; // Get primary role

  // Auto-open add registration state
  const [autoOpenAddRegistration, setAutoOpenAddRegistration] = useState(false);

  // Check for addRegistration query parameter on mount
  useEffect(() => {
    const shouldAddRegistration = searchParams.get('addRegistration') === 'true';
    if (shouldAddRegistration) {
      setAutoOpenAddRegistration(true);
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('addRegistration');
      window.history.replaceState({}, '', newUrl.toString());
    }
  }, [searchParams]);

  // Create an Owner object from the User object or use a placeholder
  const person = people.find(p => p.id === dog.ownerId);
  const owner: Owner = person
    ? {
        id: person.id,
        name: `${person.firstName} ${person.lastName}`,
        email: person.email,
        phone: person.phone,
        profileImage: person.profileImage,
      }
    : {
        id: 'unknown',
        name: 'Unknown Owner',
        email: 'N/A',
        phone: 'N/A',
      };

  // Panel/dialog state
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  // Photo Dialog State
  const [isPhotoDialogOpen, setIsPhotoDialogOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isPhotoDragging, setIsPhotoDragging] = useState(false);
  const [updatedDog, setUpdatedDog] = useState<Dog>(dog);
  const [isPhotoHovered] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [recentUpdate, setRecentUpdate] = useState<string | null>(null);

  // Effect to update local dog state when prop changes
  useEffect(() => {
    setUpdatedDog(dog);
  }, [dog]);

  // Photo handlers
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
        e.target.value = ''; // Reset input
        return;
      }
      const reader = new FileReader();
      reader.onload = ev => setPhotoPreview(ev.target?.result as string);
      reader.onerror = () => toast.error('Failed to read the image file');
      reader.readAsDataURL(file);
    }
  };

  const handlePhotoSave = (preview: string | null) => {
    if (preview) {
      setUpdatedDog({ ...updatedDog, imageUrl: preview });
    }
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

  // Generate breadcrumb items
  const breadcrumbItems = useBreadcrumb({
    currentPage: 'dog',
    dog: updatedDog,
    fromPerson,
  });

  // Compute stats from entries
  const dogEntries = useEntryStore(state => state.getEntriesByDog(updatedDog.id));
  const dogStats: RecordStat[] = useMemo(() => {
    const totalEntries = dogEntries.length;
    const registrations = updatedDog.registrations?.length ?? 0;
    const statusLabel =
      (updatedDog.status || 'Active').charAt(0).toUpperCase() +
      (updatedDog.status || 'active').slice(1);

    return [
      { title: 'Entries', value: totalEntries, icon: Calendar, subtitle: 'Total show entries' },
      { title: 'Registrations', value: registrations, icon: Award, subtitle: 'Active' },
      { title: 'Breed', value: updatedDog.breed || 'Unknown', icon: Trophy },
      { title: 'Status', value: statusLabel, icon: Star },
    ];
  }, [dogEntries.length, updatedDog.registrations, updatedDog.status, updatedDog.breed]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-20 space-y-8">
      {/* Breadcrumb Navigation */}
      <Breadcrumb items={breadcrumbItems} showHomeIcon={true} className="mb-6" />

      {/* Highlight Stats */}
      <RecordStatsRow stats={dogStats} />

      {/* Hero Profile Card */}
      <HeroProfileCard
        dog={updatedDog}
        showCelebration={showCelebration}
        recentUpdate={recentUpdate}
        isPhotoHovered={isPhotoHovered}
        onEditPanelOpen={() => setIsEditPanelOpen(true)}
        onPhotoDialogOpen={() => handlePhotoDialogOpen(true)}
        onDeleteDialogOpen={() => setIsDeleteDialogOpen(true)}
        onStatusDialogOpen={() => setIsStatusDialogOpen(true)}
      />

      {/* Information Grid - About & Physical Characteristics */}
      <DogInfoCards dog={updatedDog} onEditPanelOpen={() => setIsEditPanelOpen(true)} />

      {/* Owner Information Card */}
      <OwnerInfoCard dog={updatedDog} owner={owner} />

      {/* Dog Summary Card */}
      <DogSummaryCard dog={updatedDog} />

      {/* Navigation Tabs */}
      <DogDetailsTabs dog={updatedDog} autoOpenAddRegistration={autoOpenAddRegistration} />

      {/* Dialogs (Edit, Delete, Photo) */}
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
        onPhotoDialogOpen={handlePhotoDialogOpen}
        onPhotoDrop={handlePhotoDrop}
        onPhotoDragOver={handlePhotoDragOver}
        onPhotoDragLeave={handlePhotoDragLeave}
        onPhotoFileInput={handlePhotoFileInput}
        onPhotoSave={handlePhotoSave}
        onSetUpdatedDog={setUpdatedDog}
        onSetShowCelebration={setShowCelebration}
        onSetRecentUpdate={setRecentUpdate}
        onSetIsEditPanelOpen={setIsEditPanelOpen}
      />

      {/* Status Dialog */}
      <DogStatusDialog
        open={isStatusDialogOpen}
        onOpenChange={setIsStatusDialogOpen}
        dogName={getDogDisplayName(updatedDog)}
        currentStatus={updatedDog.status || 'active'}
        currentDeceasedDate={updatedDog.deceasedDate}
        onSave={handleStatusSave}
      />
    </div>
  );
};

export default DogDetailsMain;
