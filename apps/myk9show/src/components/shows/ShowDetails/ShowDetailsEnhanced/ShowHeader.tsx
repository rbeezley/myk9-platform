import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { UserPlus, Settings, ArrowRight } from 'lucide-react';
import { UserRole, PERMISSIONS } from '@/types/auth-types';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import Breadcrumb from '@/components/common/Breadcrumb';
import { ShowBrandedHero } from '../../ShowBrandedHero';
import { CoverImageUpload } from '@/components/ui/cover-image-upload';
import { resolveShowBranding } from '@/lib/branding';
import { useShowStore } from '@/store/showStore';
import { useClubStore } from '@/store/clubStore';
import { uploadShowCover, deleteImage } from '@/services/imageUploadService';
import { notifications } from '@/lib/notifications';
import { getErrorMessage } from '@myk9/core';
import { logger } from '@/services/LoggingService';
import type { ShowInput } from '@/types/show-types';
import type { ShowHeaderProps } from './types';

export const ShowHeader: React.FC<ShowHeaderProps> = ({
  showData,
  primaryRole,
  registrationState,
  onRegisterForShow,
  onEditShow,
  breadcrumbItems,
}) => {
  const updateShow = useShowStore(s => s.updateShow);
  const club = useClubStore(s => s.clubs.find(c => c.id === showData.clubId));
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  const canEditBranding =
    primaryRole === UserRole.SECRETARY ||
    primaryRole === UserRole.CLUB_ADMIN ||
    primaryRole === UserRole.SITE_ADMIN;

  const handleCoverUpload = useCallback(
    async (file: File) => {
      setIsUploadingCover(true);
      try {
        const result = await uploadShowCover(showData.id, file);
        if (result.success && result.url) {
          await updateShow(showData.id, { coverImageUrl: result.url } as Partial<ShowInput>);
          notifications.success('Cover image updated');
        } else {
          notifications.error('Failed to upload cover image', {
            description: result.error ?? 'Unknown error',
          });
        }
      } catch (error) {
        logger.error('Cover upload failed', 'shows', { showId: showData.id }, error as Error);
        notifications.error('Failed to upload cover image', {
          description: getErrorMessage(error),
        });
      } finally {
        setIsUploadingCover(false);
      }
    },
    [showData.id, updateShow]
  );

  const handleCoverRemove = useCallback(async () => {
    try {
      if (showData.coverImageUrl) {
        await deleteImage(showData.coverImageUrl);
      }
      await updateShow(showData.id, { coverImageUrl: '' } as Partial<ShowInput>);
      notifications.success('Cover image removed');
    } catch (error) {
      logger.error('Cover remove failed', 'shows', { showId: showData.id }, error as Error);
      notifications.error('Failed to remove cover image', {
        description: getErrorMessage(error),
      });
    }
  }, [showData.id, showData.coverImageUrl, updateShow]);

  const branding = useMemo(
    () =>
      resolveShowBranding(
        {
          logoUrl: showData.logoUrl,
          coverImageUrl: showData.coverImageUrl,
          accentColor: showData.accentColor,
        },
        {
          logo: club?.logo ?? null,
          coverImage: club?.coverImage ?? null,
          accentColor: club?.accentColor ?? null,
        }
      ),
    [
      showData.logoUrl,
      showData.coverImageUrl,
      showData.accentColor,
      club?.logo,
      club?.coverImage,
      club?.accentColor,
    ]
  );

  return (
    <div className="mb-12">
      <Breadcrumb items={breadcrumbItems} showHomeIcon={true} />

      <div className="mt-8">
        <CoverImageUpload
          editable={canEditBranding}
          hasCover={!!showData.coverImageUrl}
          isUploading={isUploadingCover}
          onUpload={handleCoverUpload}
          onRemove={handleCoverRemove}
        >
          <ShowBrandedHero
            showName={showData.name}
            location={showData.location ?? ''}
            startDate={showData.startDate}
            endDate={showData.endDate}
            clubName={showData.clubName}
            organization={showData.organization}
            status={showData.status}
            logo={branding.logo}
            coverImage={branding.coverImage}
            accentColor={branding.accentColor}
          />
        </CoverImageUpload>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-4 mt-6">
        {primaryRole === UserRole.EXHIBITOR &&
          onRegisterForShow &&
          (registrationState.canRegister ? (
            <Button onClick={onRegisterForShow} size="lg">
              <UserPlus className="w-5 h-5 mr-3" />
              Register for Show
              <ArrowRight className="w-5 h-5 ml-3" />
            </Button>
          ) : (
            <Button
              disabled
              size="lg"
              variant="outline"
              className="px-8 py-3 text-base bg-gray-50 border-gray-200"
            >
              <UserPlus className="w-5 h-5 mr-3" />
              {!registrationState.isPublished
                ? 'Not Published'
                : !registrationState.entriesOpen
                  ? 'Opens Soon'
                  : 'Registration Closed'}
            </Button>
          ))}

        {(primaryRole === UserRole.SECRETARY ||
          primaryRole === UserRole.CLUB_ADMIN ||
          primaryRole === UserRole.SITE_ADMIN) && (
          <PermissionGuard permission={PERMISSIONS.SHOW_UPDATE}>
            <Button
              onClick={onEditShow}
              variant="outline"
              size="lg"
              className="px-8 py-3 text-base border-2 border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-all duration-300 font-semibold"
            >
              <Settings className="w-5 h-5 mr-3" />
              Manage Show
            </Button>
          </PermissionGuard>
        )}
      </div>
    </div>
  );
};
