import { useState, startTransition, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClubStore } from '@/store/clubStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { ClubAdminService } from '@/services/clubAdminService';
import { ScopeType } from '@/types/auth-types';
import { Club } from '@/types/club-types';
import { RegistrationFormData } from '@/types/show-registration-types';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { getErrorMessage } from '@myk9/core';
import type { ClubTab, StatCard } from './types';

/** Maximum photo file size in bytes (5 MB) */
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Process a photo file and return a data URL string via the provided callback.
 * Validates file size before reading.
 */
function processPhotoFile(file: File, onResult: (dataUrl: string) => void): void {
  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    alert('File size must be less than 5MB');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const result = e.target?.result as string;
    onResult(result);
  };
  reader.readAsDataURL(file);
}

export function useClubDetailsState(selectedClub: Club | null) {
  const navigate = useNavigate();
  const { updateClub, removeClub } = useClubStore();

  // Tab state
  const [activeTab, setActiveTab] = useState<ClubTab>('upcoming');

  // Edit panel state
  const [showEditPanel, setShowEditPanel] = useState(false);

  // Photo dialog state
  const [showPhotoDialog, setShowPhotoDialog] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Registration dialog state
  const [showRegistrationDialog, setShowRegistrationDialog] = useState(false);
  const [selectedShowForRegistration, setSelectedShowForRegistration] = useState<string | null>(null);

  // Show creation wizard state
  const [showWizardDialog, setShowWizardDialog] = useState(false);

  // Delete club dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Add member dialog state
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);

  // Auth context for RBAC
  const { userWithRoles, hasPermission } = useAuthContext();

  // RBAC permission check
  const canManageMembers = useMemo(() => {
    return !!(
      userWithRoles &&
      selectedClub &&
      userWithRoles.databaseUserId &&
      (hasPermission('club:manage_members', { type: ScopeType.CLUB, id: selectedClub.id }) ||
        ClubAdminService.isClubAdmin(userWithRoles.databaseUserId, selectedClub.id))
    );
  }, [userWithRoles, selectedClub, hasPermission]);

  // Stats computation
  const stats: StatCard[] = useMemo(() => {
    if (!selectedClub) return [];

    const totalShows = (selectedClub.upcomingShows?.length || 0) + (selectedClub.pastShows?.length || 0);
    const upcomingShows = selectedClub.upcomingShows?.length || 0;
    const pastShows = selectedClub.pastShows?.length || 0;
    const memberCount = selectedClub.memberIds?.length || 0;

    return [
      {
        title: 'Total Shows',
        value: totalShows.toString(),
        detail1: totalShows > 0 ? `Upcoming: ${upcomingShows}` : 'No shows scheduled',
        detail2: totalShows > 0 ? `Completed: ${pastShows}` : 'Add your first show',
        type: 'shows' as const,
        tab: 'upcoming' as const,
      },
      {
        title: 'Active Members',
        value: memberCount.toString(),
        detail1: memberCount > 0 ? `${memberCount} member${memberCount !== 1 ? 's' : ''}` : 'No members yet',
        detail2: memberCount > 0 ? 'In club roster' : 'Invite members to join',
        type: 'members' as const,
        tab: 'members' as const,
      },
    ];
  }, [selectedClub]);

  // --- Handlers ---

  const handleEditClub = useCallback(() => {
    setShowEditPanel(true);
  }, []);

  const handleDeleteClub = useCallback(() => {
    setShowDeleteDialog(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    logger.debug('handleConfirmDelete called', 'clubs', {
      selectedClub: selectedClub?.name,
      userWithRoles: userWithRoles?.id,
      databaseUserId: userWithRoles?.databaseUserId,
    });

    if (!selectedClub) {
      logger.error('No club selected for deletion', 'clubs');
      setShowDeleteDialog(false);
      return;
    }

    if (!userWithRoles || !userWithRoles.databaseUserId) {
      logger.error('No user context or database user ID available for deletion', 'clubs');
      setShowDeleteDialog(false);
      return;
    }

    logger.info('Starting deletion process', 'clubs', {
      clubId: selectedClub.id,
      clubName: selectedClub.name,
      authUserId: userWithRoles.id,
      databaseUserId: userWithRoles.databaseUserId,
      userEmail: userWithRoles.email,
    });

    setIsDeleting(true);
    try {
      logger.debug('Calling removeClub', 'clubs');
      await removeClub(selectedClub.id);
      logger.info('Club deletion completed successfully', 'clubs', { clubId: selectedClub.id });
      setShowDeleteDialog(false);
      navigate('/clubs');
    } catch (error) {
      logger.error('Club deletion failed', 'clubs', { clubId: selectedClub.id }, error as Error);
      setShowDeleteDialog(false);
      notifications.error('Failed to delete club', {
        description: getErrorMessage(error),
      });
    } finally {
      setIsDeleting(false);
    }
  }, [selectedClub, userWithRoles, removeClub, navigate]);

  const handleClubEditComplete = useCallback(async (formData: Partial<Club>) => {
    if (!selectedClub) return;

    logger.debug('Saving club form data', 'clubs', { formData });

    const updatedClub: Club = {
      ...selectedClub,
      ...formData,
      id: selectedClub.id,
      address: formData.address || {
        street: (formData as Record<string, unknown>).street as string || selectedClub.address?.street || '',
        city: (formData as Record<string, unknown>).city as string || selectedClub.address?.city || '',
        state: (formData as Record<string, unknown>).state as string || selectedClub.address?.state || '',
        zipCode: (formData as Record<string, unknown>).zipCode as string || selectedClub.address?.zipCode || '',
        country: (formData as Record<string, unknown>).country as string || selectedClub.address?.country || 'US',
      },
    };

    logger.debug('Updated club object', 'clubs', { updatedClub });

    try {
      await updateClub(updatedClub);
      setShowEditPanel(false);
    } catch (error) {
      logger.error('Failed to save club', 'clubs', { clubId: selectedClub.id }, error as Error);
      notifications.error('Failed to save club', {
        description: getErrorMessage(error),
      });
    }
  }, [selectedClub, updateClub]);

  const handleViewShowDetails = useCallback((showId: string) => {
    startTransition(() => {
      navigate(`/shows/${showId}`);
    });
  }, [navigate]);

  // Photo handlers
  const handleEditPhoto = useCallback(() => {
    setShowPhotoDialog(true);
  }, []);

  const handlePhotoDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processPhotoFile(files[0], setPreviewImage);
    }
  }, []);

  const handlePhotoDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handlePhotoDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handlePhotoFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processPhotoFile(files[0], setPreviewImage);
    }
  }, []);

  const handlePhotoCancel = useCallback(() => {
    setPreviewImage(null);
    setShowPhotoDialog(false);
  }, []);

  const handlePhotoSave = useCallback(async (savedImage: string | null) => {
    if (savedImage && selectedClub) {
      const updatedClub = {
        ...selectedClub,
        logo: savedImage,
      };
      await updateClub(updatedClub);
      setPreviewImage(null);
      setShowPhotoDialog(false);
    }
  }, [selectedClub, updateClub]);

  // Registration handlers
  const handleRegisterForShow = useCallback((showId: string) => {
    setSelectedShowForRegistration(showId);
    setShowRegistrationDialog(true);
  }, []);

  const handleRegistrationComplete = useCallback((data: RegistrationFormData) => {
    logger.info('Registration completed', 'clubs', { registrationData: data });
    setShowRegistrationDialog(false);
    setSelectedShowForRegistration(null);
  }, []);

  const handleRegistrationCancel = useCallback(() => {
    setShowRegistrationDialog(false);
    setSelectedShowForRegistration(null);
  }, []);

  // Add Show handler
  const handleAddShow = useCallback(() => {
    setShowWizardDialog(true);
  }, []);

  // Add Member handler
  const handleAddMember = useCallback(() => {
    setShowAddMemberDialog(true);
  }, []);

  return {
    // Tab
    activeTab,
    setActiveTab,
    // Stats
    stats,
    // Permissions
    canManageMembers,
    // Edit panel
    showEditPanel,
    setShowEditPanel,
    handleEditClub,
    handleClubEditComplete,
    // Delete
    showDeleteDialog,
    setShowDeleteDialog,
    isDeleting,
    handleDeleteClub,
    handleConfirmDelete,
    // Photo
    showPhotoDialog,
    setShowPhotoDialog,
    previewImage,
    isDragging,
    handleEditPhoto,
    handlePhotoDrop,
    handlePhotoDragOver,
    handlePhotoDragLeave,
    handlePhotoFileInput,
    handlePhotoCancel,
    handlePhotoSave,
    // Registration
    showRegistrationDialog,
    setShowRegistrationDialog,
    selectedShowForRegistration,
    handleRegisterForShow,
    handleRegistrationComplete,
    handleRegistrationCancel,
    // Show wizard
    showWizardDialog,
    setShowWizardDialog,
    handleAddShow,
    // Members
    showAddMemberDialog,
    setShowAddMemberDialog,
    handleAddMember,
    // Navigation
    handleViewShowDetails,
  };
}
