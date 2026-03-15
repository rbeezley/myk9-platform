import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Mail, MapPin, Settings, PawPrint, Award } from 'lucide-react';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { getErrorMessage } from '@myk9/core';
import { queryKeys } from '@/lib/queryClient';
import { useUserStore } from '@/store/userStore';
import { useOwnerDogsWithQuery } from '@/hooks/useDogStoreCompat';
import { useUpdateUserMutation, useDeleteUserMutation } from '@/hooks/queries/useUsersQuery';
import UserDetailsTabs from '@/components/users/UserDetails/UserDetailsTabs';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { UserRole } from '@/types/auth-types';
import { User as UserType } from '@/types/user-types';
import { useRBAC } from '@/hooks/useRBAC';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useRoleBasedPeople } from '@/hooks/useRoleBasedData';
import { RecordPageLayout } from '@/components/layout/record';
import type { PropertySectionConfig, AssociationConfig } from '@/components/layout/record';
import type { JudgeQualification } from '@/types/judge-types';
import { extractPersonName, buildFormData } from './userDetailsTypes';
import HeroProfileCard from './HeroProfileCard';
import JudgeQualificationsCard from './JudgeQualificationsCard';
import JudgeAvailabilityCard from './JudgeAvailabilityCard';
import UserDetailsDialogs from './UserDetailsDialogs';
import '@/styles/myk9-user-details.css';
import '@/styles/myk9-show-details.css';

interface UserDetailsViewProps {
  person: UserType;
}

const UserDetailsView: React.FC<UserDetailsViewProps> = ({ person }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthContext();
  const { hasPermission } = useRBAC();
  const { loadUsers } = useUserStore();
  const { dogs: ownerDogs } = useOwnerDogsWithQuery(person.id);
  const updateUserMutation = useUpdateUserMutation();
  const deleteUserMutation = useDeleteUserMutation();
  const people = useRoleBasedPeople();

  const dogCount = ownerDogs.length;

  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isQualificationsPanelOpen, setIsQualificationsPanelOpen] = useState(false);
  const { firstName, lastName, fullName } = extractPersonName(person);

  const [formData, setFormData] = useState(buildFormData(person));
  const [isDragging, setIsDragging] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const canManageQualifications = () => {
    if (hasPermission('admin:manage')) return true;
    if (hasPermission('show:manage')) return true;
    if (person.id && currentUser?.id === person.id) {
      return hasPermission('judge:manage_qualifications') || hasPermission('user:update');
    }
    return false;
  };

  React.useEffect(() => {
    if (person) {
      setFormData(buildFormData(person));
    }
  }, [person]);

  const handleDeleteUser = async () => {
    try {
      logger.debug('Deleting user', 'users', { userId: person.id });
      await deleteUserMutation.mutateAsync({ id: person.id });
      setIsDeleteDialogOpen(false);
      notifications.success('User deleted successfully');
      const remainingPeople = people.filter(p => p.id !== person.id);
      if (remainingPeople.length > 0) {
        navigate(`/users/${remainingPeople[0].id}`, { replace: true });
      } else {
        navigate('/people', { replace: true });
      }
      logger.info('User deleted successfully', 'users', { userId: person.id });
    } catch (error) {
      logger.error('Failed to delete user', 'users', { userId: person.id }, error as Error);
      notifications.error('Failed to delete user', { description: getErrorMessage(error) });
    }
  };

  const handleQualificationsSave = async (qualifications: JudgeQualification[]) => {
    setFormData(prev => ({ ...prev, judgeQualifications: qualifications }));
    try {
      const { judgeQualificationQueries } =
        await import('@/services/database/queries/judgeQueries');
      const existing = await judgeQualificationQueries.getByJudgeId(person.id);
      await Promise.all(existing.map(q => judgeQualificationQueries.delete(q.id)));
      await Promise.all(
        qualifications.map(qual =>
          judgeQualificationQueries.create({
            person_id: person.id,
            organization: qual.organization,
            qualification_level: qual.level || 'Regular',
            disciplines: qual.disciplines || qual.showTypes || [],
            date_obtained:
              qual.certificationDate ||
              (qual.dateObtained
                ? new Date(qual.dateObtained as unknown as string).toISOString().split('T')[0]
                : new Date().toISOString().split('T')[0]),
            ...(qual.expirationDate
              ? {
                  expiration_date: new Date(qual.expirationDate as unknown as string)
                    .toISOString()
                    .split('T')[0],
                }
              : {}),
            is_active: qual.status === 'Active',
          })
        )
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(person.id) });
      loadUsers();
      logger.info('Qualifications saved successfully', 'users', {
        userId: person.id,
        count: qualifications.length,
      });
    } catch (error) {
      logger.error('Failed to save qualifications', 'users', { userId: person.id }, error as Error);
      notifications.error('Failed to save qualifications', {
        description: getErrorMessage(error),
      });
    }
  };

  const handleUserEditSave = async (userData: Partial<UserType>) => {
    try {
      const addressValue = userData.address || userData.streetAddress || '';
      const definedUpdates: Partial<typeof formData> = {};
      if (userData.firstName !== undefined)
        definedUpdates.name = `${userData.firstName} ${userData.lastName || ''}`.trim();
      if (userData.email !== undefined) definedUpdates.email = userData.email;
      if (userData.phone !== undefined) definedUpdates.phone = userData.phone;
      if (addressValue) definedUpdates.address = addressValue;
      if (userData.city !== undefined) definedUpdates.city = userData.city;
      if (userData.state !== undefined) definedUpdates.state = userData.state;
      if (userData.zipCode !== undefined) definedUpdates.zipCode = userData.zipCode;

      setFormData(prev => ({ ...prev, ...definedUpdates }));
      logger.debug('Saving user data', 'users', { userId: person.id });

      const updates: Partial<UserType> = {
        ...(userData.firstName !== undefined && { firstName: userData.firstName }),
        ...(userData.lastName !== undefined && { lastName: userData.lastName }),
        ...(userData.email !== undefined && { email: userData.email }),
        ...(userData.phone !== undefined && { phone: userData.phone }),
        // Roles are managed via user_roles table (RoleManager), not the people table
        address: addressValue,
        city: userData.city || '',
        state: userData.state || '',
        zipCode: userData.zipCode || '',
      };

      await updateUserMutation.mutateAsync({ id: person.id, updates });
      notifications.success('User updated successfully');
      logger.info('User data saved successfully', 'users', { userId: person.id });
    } catch (error) {
      logger.error('Failed to save user data', 'users', { userId: person.id }, error as Error);
      notifications.error('Failed to save user data', { description: getErrorMessage(error) });
    }
  };

  const handleFileUpload = (file: File) => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => {
        const result = e.target?.result as string;
        setPreviewImage(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  // Left sidebar: person properties
  const properties: PropertySectionConfig[] = useMemo(() => {
    const sections: PropertySectionConfig[] = [
      {
        key: 'contact',
        title: 'Contact Information',
        icon: Mail,
        iconGradient: 'from-blue-500/10 to-indigo-500/5',
        iconColor: 'text-blue-600 dark:text-blue-400',
        fields: [
          { label: 'First Name', value: firstName },
          { label: 'Last Name', value: lastName },
          {
            label: 'Email',
            value: person.email || null,
            render: person.email ? (
              <a
                href={`mailto:${person.email}`}
                className="text-sm font-medium text-primary hover:text-primary/80 transition-colors duration-200 hover:underline truncate"
              >
                {person.email}
              </a>
            ) : undefined,
          },
          { label: 'Phone', value: formData.phone || null },
        ],
      },
      {
        key: 'address',
        title: 'Address',
        icon: MapPin,
        iconGradient: 'from-green-500/10 to-emerald-500/5',
        iconColor: 'text-green-600 dark:text-green-400',
        fields: [
          { label: 'Street', value: formData.address || null },
          { label: 'City', value: formData.city || null },
          { label: 'State', value: formData.state || null },
          { label: 'Zip Code', value: formData.zipCode || null },
        ],
      },
      {
        key: 'account',
        title: 'Account',
        icon: Settings,
        iconGradient: 'from-purple-500/10 to-purple-500/5',
        iconColor: 'text-purple-600 dark:text-purple-400',
        fields: [
          {
            label: 'Member Since',
            value: person.createdAt
              ? new Date(person.createdAt).toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                })
              : null,
          },
          { label: 'Status', value: 'Active' },
          {
            label: 'Roles',
            value: person.roles?.length ? person.roles.join(', ') : null,
          },
        ],
      },
    ];

    return sections;
  }, [firstName, lastName, person, formData]);

  // Right sidebar: associations
  const associations: AssociationConfig[] = useMemo(() => {
    const items: AssociationConfig[] = [];

    if (dogCount > 0) {
      items.push({
        key: 'dogs',
        title: 'Dogs',
        subtitle: `${dogCount} registered dog${dogCount !== 1 ? 's' : ''}`,
        icon: PawPrint,
        badge: String(dogCount),
      });
    }

    if (person.judgeQualifications && person.judgeQualifications.length > 0) {
      items.push({
        key: 'qualifications',
        title: 'Judge Qualifications',
        subtitle: `${person.judgeQualifications.length} qualification${person.judgeQualifications.length !== 1 ? 's' : ''}`,
        icon: Award,
        badge: String(person.judgeQualifications.length),
      });
    }

    return items;
  }, [dogCount, person.judgeQualifications]);

  // Center content: judge cards + tabs
  const centerContent = (
    <div className="space-y-6">
      {(person.roles?.includes(UserRole.JUDGE) ||
        (person.judgeQualifications && person.judgeQualifications.length > 0)) && (
        <JudgeQualificationsCard
          qualifications={(formData.judgeQualifications as JudgeQualification[]) || []}
          canManageQualifications={canManageQualifications()}
          onManageQualifications={() => setIsQualificationsPanelOpen(true)}
        />
      )}

      {person.roles?.includes(UserRole.JUDGE) && <JudgeAvailabilityCard personId={person.id} />}

      <UserDetailsTabs selectedUser={person} />
    </div>
  );

  return (
    <>
      <RecordPageLayout
        className="py-20"
        storageKey="myk9:person"
        breadcrumb={
          <Breadcrumb
            showHomeIcon
            items={[
              { label: 'People', href: '/people' },
              { label: fullName, isCurrentPage: true },
            ]}
          />
        }
        hero={
          <HeroProfileCard
            person={person}
            firstName={firstName}
            lastName={lastName}
            fullName={fullName}
            photo={formData.photo}
            phone={formData.phone}
            onEditPhoto={() => setIsPhotoModalOpen(true)}
            onEdit={() => setIsEditModalOpen(true)}
            onDelete={() => setIsDeleteDialogOpen(true)}
          />
        }
        properties={properties}
        tabsContent={centerContent}
        associations={associations}
      />

      <UserDetailsDialogs
        person={person}
        formData={{
          name: formData.name,
          photo: formData.photo,
          judgeQualifications: formData.judgeQualifications as JudgeQualification[],
        }}
        isEditModalOpen={isEditModalOpen}
        setIsEditModalOpen={setIsEditModalOpen}
        isPhotoModalOpen={isPhotoModalOpen}
        setIsPhotoModalOpen={setIsPhotoModalOpen}
        isDeleteDialogOpen={isDeleteDialogOpen}
        setIsDeleteDialogOpen={setIsDeleteDialogOpen}
        isQualificationsPanelOpen={isQualificationsPanelOpen}
        setIsQualificationsPanelOpen={setIsQualificationsPanelOpen}
        previewImage={previewImage}
        setPreviewImage={setPreviewImage}
        isDragging={isDragging}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDeleteUser={handleDeleteUser}
        onUserEditSave={handleUserEditSave}
        onQualificationsSave={handleQualificationsSave}
        onPhotoSave={() => {
          if (previewImage) {
            setFormData(prev => ({ ...prev, photo: previewImage }));
          }
          setIsPhotoModalOpen(false);
          setPreviewImage(null);
        }}
        onFileInput={e => {
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = ev => {
              const result = ev.target?.result as string;
              setPreviewImage(result);
            };
            reader.readAsDataURL(file);
          }
        }}
      />
    </>
  );
};

export default UserDetailsView;
