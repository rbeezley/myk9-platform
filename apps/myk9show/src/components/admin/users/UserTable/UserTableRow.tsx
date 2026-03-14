/**
 * UserTableRow - Individual row rendering for each user
 */

import React from 'react';
import { Mail, Phone, MapPin, Calendar, Building2 } from 'lucide-react';
import { TableCell, TableRow } from '@/components/ui/table';

import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

import { User } from '@/types/user-types';
import type { AdminUser } from '@/hooks/queries/useUsersQuery';
import { ROLE_CONFIG } from './types';
import type { DensityConfig } from './types';
import {
  getUserInitials,
  getUserFullName,
  getUserStatus,
  getStatusConfig,
  getDeletedStatusConfig,
  getAvatarGradient,
  highlightSearchTerm,
} from './utils';
import { RowActions } from './RowActions';

function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${diffYears}y ago`;
}

function isStaleLogin(dateString: string | null | undefined, thresholdDays: number = 180): boolean {
  if (!dateString) return false;
  const diffMs = Date.now() - new Date(dateString).getTime();
  return diffMs > thresholdDays * 86400000;
}

interface UserTableRowProps {
  user: User;
  isSelected: boolean;
  density: DensityConfig;
  searchTerm: string;
  onSelectUser: (user: User, selected: boolean) => void;
  onUserClick: (user: User) => void;
  onViewUser: (user: User) => void;
  onEditUser: (user: User) => void;
  onDeleteUser: (user: User) => void;
}

export const UserTableRowComponent: React.FC<UserTableRowProps> = ({
  user,
  isSelected,
  density,
  searchTerm,
  onSelectUser,
  onUserClick,
  onViewUser,
  onEditUser,
  onDeleteUser,
}) => {
  const adminUser = user as AdminUser;
  const lastSignInAt = adminUser.lastSignInAt;
  const status = getUserStatus(user);
  const statusConfig = user.deletedAt ? getDeletedStatusConfig() : getStatusConfig(status);
  const initials = getUserInitials(user);
  const avatarGradient = getAvatarGradient(initials);
  const fullName = getUserFullName(user);
  const isDeleted = !!user.deletedAt;
  const isSuspended = user.status === 'suspended';

  return (
    <TableRow
      className={`myk9-table-row ${density.rowHeight} group relative ${isSelected ? 'selected' : ''} ${isDeleted ? 'opacity-50' : ''}`}
      style={isSuspended && !isDeleted ? { backgroundColor: 'rgba(239, 68, 68, 0.03)' } : undefined}
      onClick={() => onUserClick(user)}
    >
      {/* Selection Checkbox */}
      <TableCell onClick={e => e.stopPropagation()} className="myk9-table-cell">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={e => onSelectUser(user, e.target.checked)}
          className="h-4 w-4 rounded border-gray-400 accent-blue-500 cursor-pointer"
        />
      </TableCell>

      {/* User Information */}
      <TableCell className="myk9-table-cell">
        <div className={`flex items-center ${density.spacing}`}>
          <div className="relative">
            <Avatar
              className={`${density.avatarSize} ring-2 ring-white/50 ring-offset-2 ring-offset-background shadow-sm`}
            >
              <AvatarFallback
                className={`${density.fontSize} font-[650] bg-gradient-to-br ${avatarGradient} text-white shadow-inner`}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            {statusConfig && (
              <div
                className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-background bg-gradient-to-br flex items-center justify-center"
                style={{ backgroundColor: statusConfig.background }}
              >
                <statusConfig.icon className="h-2.5 w-2.5" style={{ color: statusConfig.color }} />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div
              className={`font-[590] text-foreground truncate ${density.fontSize} leading-tight`}
            >
              {!user.firstName && !user.lastName ? (
                <span className="italic text-muted-foreground">&mdash; &mdash;</span>
              ) : (
                highlightSearchTerm(fullName, searchTerm)
              )}
            </div>
            {user.membershipId && (
              <div className="text-xs text-muted-foreground font-[500] mt-1 tracking-wide">
                ID: {highlightSearchTerm(user.membershipId, searchTerm)}
              </div>
            )}
          </div>
        </div>
      </TableCell>

      {/* Contact Information */}
      <TableCell className="myk9-table-cell">
        <div className="space-y-2">
          {user.email && (
            <div className={`flex items-center ${density.spacing} text-sm`}>
              <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-blue-500/10 to-blue-500/5 flex items-center justify-center border border-blue-500/20">
                <Mail className="h-3 w-3 text-blue-600" />
              </div>
              <span className="truncate font-[500] text-foreground">
                {highlightSearchTerm(user.email, searchTerm)}
              </span>
            </div>
          )}
          {user.phone && (
            <div className={`flex items-center ${density.spacing} text-sm text-muted-foreground`}>
              <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-green-500/10 to-green-500/5 flex items-center justify-center border border-green-500/20">
                <Phone className="h-3 w-3 text-green-600" />
              </div>
              <span className="font-[500]">{highlightSearchTerm(user.phone, searchTerm)}</span>
            </div>
          )}
          {(user.city || user.state) && (
            <div className={`flex items-center ${density.spacing} text-sm text-muted-foreground`}>
              <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-orange-500/10 to-orange-500/5 flex items-center justify-center border border-orange-500/20">
                <MapPin className="h-3 w-3 text-orange-600" />
              </div>
              <span className="font-[500]">
                {highlightSearchTerm(
                  [user.city, user.state].filter(Boolean).join(', '),
                  searchTerm
                )}
              </span>
            </div>
          )}
        </div>
      </TableCell>

      {/* Roles and Affiliations */}
      <TableCell className="myk9-table-cell">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {user.roles?.map(role => {
              const roleConfig = ROLE_CONFIG[role as keyof typeof ROLE_CONFIG];
              return (
                <Badge
                  key={role}
                  variant="outline"
                  className="text-xs font-[590] px-3 py-1 rounded-full border-0 transition-all duration-200"
                  style={{
                    backgroundColor: roleConfig?.background || 'rgba(142, 142, 147, 0.1)',
                    color: roleConfig?.color || '#8E8E93',
                  }}
                >
                  {roleConfig?.icon && <roleConfig.icon className="h-3 w-3 mr-1" />}
                  {roleConfig?.label || role}
                </Badge>
              );
            }) || (
              <Badge
                variant="outline"
                className="text-xs font-[590] px-3 py-1 rounded-full border border-border/60 text-muted-foreground"
              >
                No Role
              </Badge>
            )}
          </div>

          {user.clubAffiliations && user.clubAffiliations.length > 0 && (
            <div className={`flex items-center ${density.spacing} text-xs text-muted-foreground`}>
              <div className="h-5 w-5 rounded-md bg-gradient-to-br from-purple-500/10 to-purple-500/5 flex items-center justify-center border border-purple-500/20">
                <Building2 className="h-3 w-3 text-purple-600" />
              </div>
              <span className="truncate font-[500]">
                {user.clubAffiliations.length === 1
                  ? highlightSearchTerm(user.clubAffiliations[0], searchTerm)
                  : `${user.clubAffiliations.length} clubs`}
              </span>
            </div>
          )}
        </div>
      </TableCell>

      {/* Last Login */}
      <TableCell className="myk9-table-cell">
        <div className={`flex items-center ${density.spacing} text-sm text-muted-foreground`}>
          <div className="h-5 w-5 rounded-md bg-gradient-to-br from-gray-500/10 to-gray-500/5 flex items-center justify-center border border-gray-500/20">
            <Calendar className="h-3 w-3 text-gray-600" />
          </div>
          <span
            className="font-[500]"
            style={isStaleLogin(lastSignInAt) ? { color: '#EF4444' } : undefined}
          >
            {formatRelativeTime(lastSignInAt)}
          </span>
        </div>
      </TableCell>

      {/* Status Badge */}
      <TableCell className="myk9-table-cell">
        <Badge
          variant="outline"
          className="text-xs font-[590] px-3 py-1 rounded-full border-0 flex items-center gap-1.5 transition-all duration-200"
          style={{
            backgroundColor: statusConfig.background,
            color: statusConfig.color,
          }}
        >
          <statusConfig.icon className="h-3 w-3" />
          {statusConfig.label}
        </Badge>
      </TableCell>

      {/* Actions Menu */}
      <TableCell onClick={e => e.stopPropagation()} className="myk9-table-cell text-center">
        <RowActions user={user} onView={onViewUser} onEdit={onEditUser} onDelete={onDeleteUser} />
      </TableCell>
    </TableRow>
  );
};
