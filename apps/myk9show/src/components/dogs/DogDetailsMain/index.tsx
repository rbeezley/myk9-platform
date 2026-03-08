import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Trophy, Calendar, Award, Star, Heart, Activity, User as UserIcon } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { useEntryStore } from '@/store/entryStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import Breadcrumb from '@/components/common/Breadcrumb';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { RecordStatsRow, type RecordStat } from '@/components/common/RecordStatsRow';
import { RecordPageLayout } from '@/components/layout/record';
import type { PropertySectionConfig, AssociationConfig } from '@/components/layout/record';
import { getDogDisplayName, type Dog, type DogStatus, type Owner } from '@/types/dog-types';
import { usePerformanceStatistics } from '@/hooks/usePerformanceStatistics';
import { useTitleProgress } from '@/hooks/useTitleProgress';
import '@/styles/myk9-show-details.css';

import HeroProfileCard from './HeroProfileCard';
import DogDetailsTabs from './DogDetailsTabs';
import DogDialogs from './DogDialogs';
import DogStatusDialog from '@/components/dogs/DogStatusDialog';
import { validateImageFile, formatDisplayDate } from './utils';
import type { DogDetailsMainProps } from './types';

const DogDetailsMain: React.FC<DogDetailsMainProps> = ({ dog, fromPerson, onDelete, onUpdate }) => {
  const [searchParams] = useSearchParams();
  const people = useUserStore(state => state.people);
  const { getUserRoles } = useAuthContext();
  const userRole = getUserRoles()[0];

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
  const [isPhotoDialogOpen, setIsPhotoDialogOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isPhotoDragging, setIsPhotoDragging] = useState(false);
  const [updatedDog, setUpdatedDog] = useState<Dog>(dog);
  const isPhotoHovered = false;
  const [showCelebration, setShowCelebration] = useState(false);
  const [recentUpdate, setRecentUpdate] = useState<string | null>(null);

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

  const breadcrumbItems = useBreadcrumb({
    currentPage: 'dog',
    dog: updatedDog,
    fromPerson,
  });

  // Stats — select raw entries array, filter in useMemo to avoid unstable selector
  const allEntries = useEntryStore(state => state.entries);
  const dogEntries = useMemo(
    () => allEntries.filter(entry => entry.dogId === updatedDog.id),
    [allEntries, updatedDog.id]
  );
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

  // Left sidebar: property sections
  const properties: PropertySectionConfig[] = useMemo(() => {
    const gender = updatedDog.gender
      ? updatedDog.gender.charAt(0).toUpperCase() + updatedDog.gender.slice(1)
      : null;

    const sections: PropertySectionConfig[] = [
      {
        key: 'about',
        title: `About ${updatedDog.callName}`,
        icon: Heart,
        iconGradient: 'from-pink-500/10 to-rose-500/5',
        iconColor: 'text-pink-500',
        fields: [
          { label: 'Sex', value: gender },
          {
            label: 'Date of Birth',
            value: updatedDog.dateOfBirth ? formatDisplayDate(updatedDog.dateOfBirth) : null,
          },
          { label: 'Breed', value: updatedDog.breed },
        ],
      },
      {
        key: 'physical',
        title: 'Physical Characteristics',
        icon: Activity,
        iconGradient: 'from-emerald-500/10 to-emerald-500/5',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        fields: [
          { label: 'Height', value: updatedDog.height ? `${updatedDog.height}"` : null },
          { label: 'Weight', value: updatedDog.weight ? `${updatedDog.weight} lbs` : null },
          { label: 'Color', value: updatedDog.color },
          { label: 'Microchip', value: updatedDog.microchipNumber },
        ],
      },
    ];

    if (updatedDog.registrations && updatedDog.registrations.length > 0) {
      sections.push({
        key: 'registrations-sidebar',
        title: 'Registrations',
        icon: Award,
        iconGradient: 'from-purple-500/10 to-purple-500/5',
        iconColor: 'text-purple-600 dark:text-purple-400',
        fields: updatedDog.registrations.map(reg => ({
          label: reg.organization || 'Org',
          value: reg.registrationNumber || reg.registeredName || null,
        })),
      });
    }

    return sections;
  }, [updatedDog]);

  // Right sidebar: associations
  const { stats: perfStats } = usePerformanceStatistics(updatedDog.id);
  const { progressBySport } = useTitleProgress(updatedDog.id);

  const titlesEarnedCount = useMemo(
    () =>
      Object.values(progressBySport)
        .flat()
        .filter(t => t.isEarned && !t.isSuperseded).length,
    [progressBySport]
  );

  const associations: AssociationConfig[] = useMemo(() => {
    const ownerAssoc: AssociationConfig = {
      key: 'owner',
      title: owner.name,
      icon: UserIcon,
    };
    if (owner.email && owner.email !== 'N/A') ownerAssoc.subtitle = owner.email;
    if (owner.id !== 'unknown') ownerAssoc.href = `/people/${owner.id}?fromDog=${updatedDog.id}`;
    const items: AssociationConfig[] = [ownerAssoc];

    const competitions = perfStats?.summary.totalCompetitions ?? 0;
    if (competitions > 0) {
      items.push({
        key: 'competitions',
        title: 'Competitions',
        subtitle: `${competitions} total competition${competitions !== 1 ? 's' : ''}`,
        icon: Trophy,
        badge: String(competitions),
      });
    }

    if (titlesEarnedCount > 0) {
      items.push({
        key: 'titles',
        title: 'Titles Earned',
        subtitle: `${titlesEarnedCount} active title${titlesEarnedCount !== 1 ? 's' : ''}`,
        icon: Award,
        badge: String(titlesEarnedCount),
      });
    }

    return items;
  }, [owner, updatedDog.id, perfStats, titlesEarnedCount]);

  return (
    <>
      <RecordPageLayout
        className="py-20"
        storageKey="myk9:dog"
        breadcrumb={<Breadcrumb items={breadcrumbItems} showHomeIcon={true} />}
        stats={<RecordStatsRow stats={dogStats} />}
        hero={
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
        }
        properties={properties}
        tabsContent={
          <DogDetailsTabs dog={updatedDog} autoOpenAddRegistration={autoOpenAddRegistration} />
        }
        associations={associations}
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
