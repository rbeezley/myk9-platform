import React from 'react';
import { Button } from '@/components/ui/button';
import { UserPlus, Settings, ArrowRight } from 'lucide-react';
import { UserRole, PERMISSIONS } from '@/types/auth-types';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import Breadcrumb from '@/components/common/Breadcrumb';
import { ShowBrandedHero } from '../../ShowBrandedHero';
import { resolveShowBranding } from '@/lib/branding';
import type { ShowHeaderProps } from './types';

export const ShowHeader: React.FC<ShowHeaderProps> = ({
  showData,
  primaryRole,
  registrationState,
  onRegisterForShow,
  onEditShow,
  breadcrumbItems,
}) => {
  const branding = resolveShowBranding(
    {
      logoUrl: showData.logoUrl,
      coverImageUrl: showData.coverImageUrl,
      accentColor: showData.accentColor,
    },
    {}
  );

  return (
    <div className="mb-12">
      <Breadcrumb items={breadcrumbItems} showHomeIcon={true} />

      <div className="mt-8">
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
