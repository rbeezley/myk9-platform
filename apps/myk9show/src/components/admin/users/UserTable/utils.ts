/**
 * Utility functions for UserTable components
 */

import React from 'react';
import { CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { User } from '@/types/user-types';

// Status config type
export interface StatusConfig {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  /** A `--chip-*` bg/fg pair — legible in both themes, unlike an inline hex. */
  chipClass: string;
  /** Solid dot colour for the avatar badge, where there is no room for a label. */
  dotClass: string;
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
export const getUserStatus = (user: User): 'active' | 'suspended' => {
  return user.status || 'active';
};

/** Get status display config (icon, chip tokens, label) */
export const getStatusConfig = (status: string): StatusConfig => {
  switch (status) {
    case 'suspended':
      return {
        icon: XCircle,
        chipClass: 'bg-[color:var(--chip-red-bg)] text-[color:var(--chip-red-fg)]',
        dotClass: 'bg-[color:var(--chip-red-fg)]',
        label: 'Suspended',
      };
    case 'active':
    default:
      return {
        icon: CheckCircle2,
        chipClass: 'bg-[color:var(--chip-green-bg)] text-[color:var(--chip-green-fg)]',
        dotClass: 'bg-[color:var(--chip-green-fg)]',
        label: 'Active',
      };
  }
};

/** Get deleted status display config */
export const getDeletedStatusConfig = (): StatusConfig => ({
  icon: Trash2,
  chipClass: 'bg-[color:var(--chip-stone-bg)] text-[color:var(--chip-stone-fg)]',
  dotClass: 'bg-[color:var(--chip-stone-fg)]',
  label: 'Removed',
});

/**
 * Highlight search term within text, returning React nodes.
 *
 * Split with a capturing group and highlight the odd indices — those ARE the
 * matches. Re-testing each part with the /g regex looked equivalent but carried
 * `lastIndex` between calls, so every second match on a row silently lost its
 * highlight.
 */
export const highlightSearchTerm = (text: string, searchTerm: string): React.ReactNode => {
  const term = searchTerm.trim();
  if (!term) return text;

  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, index) =>
    index % 2 === 1
      ? React.createElement(
          'mark',
          {
            key: index,
            className: 'bg-warning/20 text-inherit rounded-sm px-0.5',
          },
          part
        )
      : part
  );
};

// (The former getAvatarGradient picked one of six random two-colour gradients
// from the initials — colour that encoded nothing, in hues outside the warm
// palette. Avatars now use the muted surface; the initials do the identifying.)
