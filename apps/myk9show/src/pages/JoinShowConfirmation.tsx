/**
 * JoinShowConfirmation — the Phase 1c §2.2 confirmation step, surfaced by the
 * Phase 1b smart input when a SIGNED-IN account enters a passcode.
 *
 * Locked Decision #8: a passcode expands a signed-in account's role for one
 * show — it never impersonates — so this single, security-meaningful gate is
 * the ONLY added confirmation in the flow (it is NOT a routine "are you sure?"
 * nag; INTENT explicitly permits this one). Copy uses the humanized role, never
 * the raw enum.
 */

import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { UserRole as RingsideRole } from '@myk9/ringside';
import { humanizeRingsideRole } from './SmartSignInPage.helpers';

export interface JoinShowConfirmationProps {
  open: boolean;
  /** The signed-in account's display name (first name, or a friendly fallback). */
  userName: string;
  showName: string;
  role: RingsideRole;
  isJoining: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const JoinShowConfirmation: React.FC<JoinShowConfirmationProps> = ({
  open,
  userName,
  showName,
  role,
  isJoining,
  onConfirm,
  onCancel,
}) => {
  return (
    <AlertDialog open={open} onOpenChange={next => (!next ? onCancel() : undefined)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Join this show?</AlertDialogTitle>
          <AlertDialogDescription>
            You're signed in as {userName}. Use this passcode to join {showName} as a{' '}
            {humanizeRingsideRole(role)}?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={isJoining}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isJoining}>
            {isJoining ? 'Joining…' : 'Join show'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
