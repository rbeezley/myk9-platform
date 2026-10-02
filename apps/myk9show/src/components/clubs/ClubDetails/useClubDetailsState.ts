import { useState, startTransition, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUrlTab } from '@/hooks/useUrlTab';
import { useNavigate } from 'react-router-dom';
import { useClubStore } from '@/store/clubStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { Club } from '@/types/club-types';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { getErrorMessage } from '@myk9/core';
import { friendlySaveError } from '@/utils/friendlySaveError';
import { uploadClubCover, deleteImage } from '@/services/imageUploadService';
import { getActiveClubMembers, getClubMembers } from '@/services/database/club-memberships/members';
import { canCreateShowForClub, computeClubPermissions, hasClubAdminScope } from './clubPermissions';
import { usePageEditAction } from '@/features/actions/pageEditTarget';
import { canOpenCreateShowWizard } from '@/routes/createShowWizardAccess';
import { useClubAuthorizationControl } from './useClubAuthorizationControl';
import { clubShowsStat, useClubShows } from './useClubShows';
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
  reader.onload = e => {
    const result = e.target?.result as string;
    onResult(result);
  };
  reader.readAsDataURL(file);
}

const CLUB_TAB_IDS = ['upcoming', 'past', 'about', 'members', 'branding'] as const;

export function useClubDetailsState(selectedClub: Club | null) {
  const navigate = useNavigate();
  const { updateClub } = useClubStore();
  // Tab state — URL-synced
  const [activeTab, setActiveTabRaw] = useUrlTab(CLUB_TAB_IDS, 'upcoming');
  const setActiveTab = setActiveTabRaw as (tab: ClubTab) => void;

  // Edit panel state
  const [showEditPanel, setShowEditPanel] = useState(false);

  // Photo dialog state
  const [showPhotoDialog, setShowPhotoDialog] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Delete club dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Add member dialog state
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);

  // Cover image upload state
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  // Auth context for RBAC
  const { userWithRoles } = useAuthContext();
  const isSiteAdmin = userWithRoles?.roles?.includes(UserRole.SITE_ADMIN) ?? false;

  // RBAC permission checks — see computeClubPermissions for the rules.
  const { canEditClub, canManageMembers, canEditBranding, canDeleteClub } = useMemo(() => {
    // Deliberately NOT gated on databaseUserId: the club-scoped grant lives in
    // userWithRoles.scopes, which survives a cold offline boot via the RBAC
    // cache, while databaseUserId comes from a network `people` lookup that
    // pauses offline. Requiring it denied every affordance to a club admin with
    // no signal.
    if (!userWithRoles || !selectedClub) {
      return {
        canEditClub: false,
        canManageMembers: false,
        canEditBranding: false,
        canDeleteClub: false,
      };
    }
    return computeClubPermissions({
      isClubAdmin: hasClubAdminScope(userWithRoles.scopes, selectedClub.id),
      isSiteAdmin,
    });
  }, [userWithRoles, selectedClub, isSiteAdmin]);

  // MYK9-890: Add Show opens the create wizard, so offer it only to someone the route admits
  // AND the create-show rule accepts for THIS club. Pure: no queue or timing inputs. A club's
  // creator may not see it on a brand-new club until the normal RBAC refresh lands.
  const canAddShow =
    canOpenCreateShowWizard(userWithRoles?.roles) &&
    canCreateShowForClub(userWithRoles, selectedClub?.id);

  // MYK9-572: site-admin-only control, independent of computeClubPermissions.
  const authorizationControl = useClubAuthorizationControl(selectedClub, isSiteAdmin);

  const visibleActiveTab = !canEditBranding && activeTab === 'branding' ? 'upcoming' : activeTab;

  useEffect(() => {
    if (!canEditBranding && activeTab === 'branding') {
      setActiveTab('upcoming');
    }
  }, [activeTab, canEditBranding, setActiveTab]);

  // MYK9-768: replica for signed-in viewers, the server for guests.
  const clubShows = useClubShows(selectedClub);

  // Keep the profile roster on the same club_members projection as the club
  // administration page. The selected club replica may contain stale legacy
  // memberIds, so it must not drive profile counts or member records.
  const membersQuery = useQuery({
    queryKey: ['club-members', selectedClub?.id],
    queryFn: () => getClubMembers(selectedClub!.id),
    enabled: Boolean(selectedClub?.id),
  });
  const clubMembers = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const activeMembers = useMemo(() => getActiveClubMembers(clubMembers), [clubMembers]);

  // Stats computation
  const stats: StatCard[] = useMemo(() => {
    if (!selectedClub) return [];

    const memberCount = activeMembers.length;

    return [
      clubShowsStat(clubShows),
      {
        title: 'Active Members',
        value: memberCount.toString(),
        detail1:
          memberCount > 0
            ? `${memberCount} member${memberCount !== 1 ? 's' : ''}`
            : 'No members yet',
        detail2: memberCount > 0 ? 'In club roster' : 'Invite members to join',
        type: 'members' as const,
        tab: 'members' as const,
      },
    ];
  }, [selectedClub, clubShows, activeMembers.length]);

  // --- Handlers ---

  const handleEditClub = useCallback(() => {
    setShowEditPanel(true);
  }, []);

  // Edit club is the first item of the header Actions menu (MYK9-928), behind the
  // clubs_update gate the ghost Edit button on the club header carried.
  usePageEditAction({
    kind: 'club',
    enabled: canEditClub && Boolean(selectedClub),
    run: handleEditClub,
  });

  const handleDeleteClub = useCallback(() => {
    setShowDeleteDialog(true);
  }, []);

  // The shared delete dialog (features/delete) soft-deletes the club through
  // soft_delete_club, purges it from this device and offers Undo; leave its page.
  const handleClubDeleted = useCallback(() => {
    navigate('/clubs');
  }, [navigate]);

  const handleClubEditComplete = useCallback(
    async (formData: Partial<Club>) => {
      if (!selectedClub) return;

      logger.debug('Saving club form data', 'clubs', { formData });

      const updatedClub: Club = {
        ...selectedClub,
        ...formData,
        id: selectedClub.id,
        address: formData.address || {
          street:
            ((formData as Record<string, unknown>).street as string) ||
            selectedClub.address?.street ||
            '',
          city:
            ((formData as Record<string, unknown>).city as string) ||
            selectedClub.address?.city ||
            '',
          state:
            ((formData as Record<string, unknown>).state as string) ||
            selectedClub.address?.state ||
            '',
          zipCode:
            ((formData as Record<string, unknown>).zipCode as string) ||
            selectedClub.address?.zipCode ||
            '',
          country:
            ((formData as Record<string, unknown>).country as string) ||
            selectedClub.address?.country ||
            'US',
        },
      };

      logger.debug('Updated club object', 'clubs', { updatedClub });

      try {
        await updateClub(updatedClub);
        setShowEditPanel(false);
      } catch (error) {
        logger.error('Failed to save club', 'clubs', { clubId: selectedClub.id }, error as Error);
        // EditPanelWrapper keeps the panel open and reports the failure only
        // when this rejects; swallowing it would close the panel on a failed save.
        throw error;
      }
    },
    [selectedClub, updateClub]
  );

  const handleViewShowDetails = useCallback(
    (showId: string) => {
      startTransition(() => {
        navigate(`/shows/${showId}`);
      });
    },
    [navigate]
  );

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

  const handlePhotoSave = useCallback(
    async (savedImage: string | null) => {
      if (savedImage && selectedClub) {
        const updatedClub = {
          ...selectedClub,
          logo: savedImage,
        };
        try {
          await updateClub(updatedClub);
        } catch (error) {
          // The dialog stays open with the chosen image; a rejection reaching
          // the dialog's click handler would be unhandled.
          logger.error('Logo save failed', 'clubs', { clubId: selectedClub.id }, error as Error);
          notifications.error("Couldn't save the logo", {
            description: friendlySaveError(error).description,
          });
          return;
        }
        setPreviewImage(null);
        setShowPhotoDialog(false);
      }
    },
    [selectedClub, updateClub]
  );

  // Registration handler — navigate to full-page registration wizard
  const handleRegisterForShow = useCallback(
    (showId: string) => {
      navigate(`/shows/${showId}/register`);
    },
    [navigate]
  );

  // Add Show handler — navigate to full-page wizard with club pre-selected
  const handleAddShow = useCallback(() => {
    const params = selectedClub ? `?clubId=${selectedClub.id}` : '';
    navigate(`/secretary/create-show/wizard${params}`);
  }, [navigate, selectedClub]);

  // Add Member handler
  const handleAddMember = useCallback(() => {
    setShowAddMemberDialog(true);
  }, []);

  // Cover image handlers
  const handleCoverUpload = useCallback(
    async (file: File) => {
      if (!selectedClub) return;
      setIsUploadingCover(true);
      try {
        const result = await uploadClubCover(selectedClub.id, file);
        if (result.success && result.url) {
          await updateClub({ ...selectedClub, coverImage: result.url });
          notifications.success('Cover image updated');
        } else {
          notifications.error('Failed to upload cover image', {
            description: result.error ?? 'Unknown error',
          });
        }
      } catch (error) {
        logger.error('Cover upload failed', 'clubs', { clubId: selectedClub.id }, error as Error);
        notifications.error('Failed to upload cover image', {
          description: getErrorMessage(error),
        });
      } finally {
        setIsUploadingCover(false);
      }
    },
    [selectedClub, updateClub]
  );

  const handleCoverRemove = useCallback(async () => {
    if (!selectedClub) return;
    try {
      if (selectedClub.coverImage) {
        await deleteImage(selectedClub.coverImage);
      }
      await updateClub({ ...selectedClub, coverImage: '' });
      notifications.success('Cover image removed');
    } catch (error) {
      logger.error('Cover remove failed', 'clubs', { clubId: selectedClub.id }, error as Error);
      notifications.error('Failed to remove cover image', {
        description: getErrorMessage(error),
      });
    }
  }, [selectedClub, updateClub]);

  const handleSaveAccentColor = useCallback(
    async (accentColor: string | null) => {
      if (!selectedClub) return;
      try {
        await updateClub({ ...selectedClub, accentColor: accentColor ?? '' });
        notifications.success('Brand color updated');
      } catch (error) {
        logger.error(
          'Accent color save failed',
          'clubs',
          { clubId: selectedClub.id },
          error as Error
        );
        notifications.error('Failed to update brand color', {
          description: getErrorMessage(error),
        });
      }
    },
    [selectedClub, updateClub]
  );

  return {
    // Tab
    activeTab: visibleActiveTab,
    setActiveTab,
    // Shows (useClubShows: replica when signed in, server for guests)
    upcomingShows: clubShows.upcoming,
    pastShows: clubShows.past,
    showsStatus: clubShows.status,
    retryShows: clubShows.retry,
    // Stats
    stats,
    // Members — sourced from club_members, with inactive records retained for
    // cache consistency but only active records exposed to the profile roster.
    clubMembers,
    activeMembers,
    isMembersLoading: membersQuery.isLoading,
    isMembersRefreshing: membersQuery.isFetching && !membersQuery.isLoading,
    isMembersError: membersQuery.isError,
    retryMembers: membersQuery.refetch,
    // Permissions
    canEditClub,
    canManageMembers,
    canEditBranding,
    canDeleteClub,
    canAddShow,
    ...authorizationControl, // MYK9-572: authorize/revoke control (site-admin only)
    // Edit panel
    showEditPanel,
    setShowEditPanel,
    handleEditClub,
    handleClubEditComplete,
    // Delete
    showDeleteDialog,
    setShowDeleteDialog,
    handleDeleteClub,
    handleClubDeleted,
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
    handleRegisterForShow,
    // Show wizard
    handleAddShow,
    // Members
    showAddMemberDialog,
    setShowAddMemberDialog,
    handleAddMember,
    // Cover image
    isUploadingCover,
    handleCoverUpload,
    handleCoverRemove,
    // Branding
    handleSaveAccentColor,
    // Navigation
    handleViewShowDetails,
  };
}
