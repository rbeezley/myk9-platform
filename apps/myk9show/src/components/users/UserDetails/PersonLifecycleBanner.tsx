/**
 * States a person's record can be in that the reader must know about before
 * they trust anything else on the page.
 *
 * Until MYK9-153 a removed person had no record page at all — `/people/:id`
 * bounced — so "removed" was a state the app could only express by hiding
 * things. A record you can read but not act on has to say why.
 */

import React from 'react';
import { AlertTriangle, RotateCcw, UserX } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export interface PersonLifecycleBannerProps {
  /** ISO timestamp; presence means the person is soft-deleted. */
  deletedAt?: string | undefined;
  status?: 'active' | 'suspended' | string | undefined;
  /** Omitted when the viewer may not restore — the banner still explains. */
  onRestore?: (() => void) | undefined;
  isRestoring?: boolean;
}

/** "on 30 July 2026", or nothing at all if the timestamp is unusable. */
function formatWhen(iso: string | undefined): string {
  if (!iso) return '';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  return ` on ${when.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}`;
}

export const PersonLifecycleBanner: React.FC<PersonLifecycleBannerProps> = ({
  deletedAt,
  status,
  onRestore,
  isRestoring = false,
}) => {
  // Removed outranks suspended: a removed person is also, technically, still
  // whatever status they held, and stacking two banners buries the one that
  // matters.
  if (deletedAt) {
    return (
      <Alert variant="destructive" role="status">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>This person was removed{formatWhen(deletedAt)}</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>
            They are hidden from every list and cannot be edited. Their record is kept until it is
            restored or permanently deleted.
          </span>
          {onRestore && (
            <Button variant="outline" onClick={onRestore} disabled={isRestoring} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              {isRestoring ? 'Restoring...' : 'Restore person'}
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'suspended') {
    return (
      <Alert role="status">
        <UserX className="h-4 w-4" />
        <AlertTitle>This account is suspended</AlertTitle>
        <AlertDescription>
          They cannot sign in. Their entries, dogs and history are unaffected.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
};

export default PersonLifecycleBanner;
