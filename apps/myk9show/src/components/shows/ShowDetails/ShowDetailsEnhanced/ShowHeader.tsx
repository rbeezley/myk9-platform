import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  Users,
  UserPlus,
  Settings,
  MapPin,
  ArrowRight,
} from 'lucide-react';
import { UserRole, PERMISSIONS } from '@/types/auth-types';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import Breadcrumb from '@/components/common/Breadcrumb';
import { ShowStatusBadge } from './StatusBadge';
import type { ShowHeaderProps } from './types';

export const ShowHeader: React.FC<ShowHeaderProps> = ({
  showData,
  primaryRole,
  registrationState,
  onRegisterForShow,
  onEditShow,
  breadcrumbItems,
}) => {
  return (
    <div className="mb-12">
      <Breadcrumb items={breadcrumbItems} showHomeIcon={true} />

      {/* Enhanced Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 via-white to-primary/10 backdrop-blur-xl border border-gray-200/50 shadow-xl mt-8">
        <div className="absolute inset-0 bg-primary/5" />
        <div className="relative p-8">
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-6">
              <div className="flex items-start gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-4">
                    <h1 className="text-4xl font-bold text-gray-900 leading-tight">{showData.name}</h1>
                    <ShowStatusBadge status={showData.status} />
                  </div>

                  <div className="text-xl text-gray-700 mb-6 leading-relaxed">
                    {showData.events && showData.events.length > 0
                      ? showData.events.join(' \u2022 ')
                      : 'Professional dog show competition featuring multiple events and conformation classes'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-8 text-gray-600">
                <div className="flex items-center gap-3 bg-white/60 backdrop-blur-sm rounded-lg px-4 py-2 shadow-sm">
                  <Calendar className="w-5 h-5 text-primary" />
                  <span className="font-medium">
                    {new Date(showData.startDate).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    -{' '}
                    {new Date(showData.endDate).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-3 bg-white/60 backdrop-blur-sm rounded-lg px-4 py-2 shadow-sm">
                  <Users className="w-5 h-5 text-primary" />
                  <span className="font-medium">{showData.clubName}</span>
                </div>
                {showData.location && (
                  <div className="flex items-center gap-3 bg-white/60 backdrop-blur-sm rounded-lg px-4 py-2 shadow-sm">
                    <MapPin className="w-5 h-5 text-green-600" />
                    <span className="font-medium">{showData.location}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Primary Action Button - Role-based */}
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
        </div>
      </div>
    </div>
  );
};
