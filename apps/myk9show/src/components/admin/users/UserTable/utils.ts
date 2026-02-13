/**
 * Utility functions for UserTable components
 */

import React from 'react';
import { CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { User } from '@/types/user-types';

// Status config type
export interface StatusConfig {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  background: string;
  label: string;
}

/** Get user initials for avatar fallback */
export const getUserInitials = (user: User): string => {
  const first = user.firstName?.[0] || '';
  const last = user.lastName?.[0] || '';
  return (first + last).toUpperCase() || 'U';
};

/** Get user full name display */
export const getUserFullName = (user: User): string => {
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return name || 'Unnamed User';
};

/** Determine user account status */
export const getUserStatus = (user: User): 'active' | 'incomplete' | 'inactive' => {
  if (!user.email) return 'inactive';
  if (!user.firstName || !user.lastName) return 'incomplete';
  return 'active';
};

/** Get status display config (icon, color, label) */
export const getStatusConfig = (status: string): StatusConfig => {
  switch (status) {
    case 'active':
      return {
        icon: CheckCircle2,
        color: '#34C759',
        background: 'rgba(52, 199, 89, 0.1)',
        label: 'Active',
      };
    case 'incomplete':
      return {
        icon: AlertCircle,
        color: '#FF9500',
        background: 'rgba(255, 149, 0, 0.1)',
        label: 'Incomplete',
      };
    default:
      return {
        icon: Clock,
        color: '#8E8E93',
        background: 'rgba(142, 142, 147, 0.1)',
        label: 'Inactive',
      };
  }
};

/** Highlight search term within text, returning React nodes */
export const highlightSearchTerm = (
  text: string,
  searchTerm: string
): React.ReactNode => {
  if (!searchTerm.trim()) return text;

  const regex = new RegExp(
    `(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
    'gi'
  );
  const parts = text.split(regex);

  return parts.map((part, index) =>
    regex.test(part)
      ? React.createElement(
          'mark',
          {
            key: index,
            className:
              'bg-yellow-200/60 dark:bg-yellow-500/20 text-inherit rounded-sm px-0.5',
          },
          part
        )
      : part
  );
};

/** Generate gradient class string for avatar backgrounds based on initials */
export const getAvatarGradient = (initials: string): string => {
  const colors = [
    'from-primary to-teal-600',
    'from-green-500 to-teal-600',
    'from-orange-500 to-red-600',
    'from-purple-500 to-pink-600',
    'from-teal-500 to-cyan-600',
    'from-red-500 to-orange-600',
  ];
  const index = initials.charCodeAt(0) % colors.length;
  return colors[index];
};
