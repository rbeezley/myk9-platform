/**
 * Explains the add-only class step's disabled "Already entered" checkboxes.
 *
 * `ClassSelectionStep` is SHARED between the exhibitor wizard and the
 * secretary/admin registration flow, so the recovery path must follow the
 * workflow mode: an exhibitor is pointed at the show team, while staff — who
 * ARE the show team — are pointed at Entry Management, the canonical surface
 * for changing or withdrawing an existing entry.
 *
 * @module RegistrationWorkflow/AlreadyEnteredNotice
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { WorkflowMode } from './RegistrationWorkflow.types';

interface AlreadyEnteredNoticeProps {
  showId: string;
  dogName: string;
  /** Defaults to the exhibitor wizard, the only caller that omits it. */
  workflowMode?: WorkflowMode | undefined;
}

// INTENT: this wizard is add-only — classes a dog already entered render
// disabled with no withdraw/move-up path. Say so plainly once (per dog, not
// per row) and point at the show team, the existing /messages/:showId
// surface, instead of leaving the disabled checkboxes unexplained
// (exhibitor-elderly-novice audit 2026-07-23, row 11; docs/INTENT.md
// "I trust this with my day"). Staff never see that line — telling a
// secretary to message the show team opens a thread with themselves; they get
// the existing Entry Management deep link instead.
export const AlreadyEnteredNotice: React.FC<AlreadyEnteredNoticeProps> = ({
  showId,
  dogName,
  workflowMode = 'exhibitor',
}) => {
  const isStaff = workflowMode !== 'exhibitor';

  return (
    <Alert className="mb-3">
      <CheckCircle2 className="h-4 w-4 text-success" />
      <AlertDescription>
        {dogName} is already entered in the classes marked &ldquo;Already entered&rdquo; below —
        those can&apos;t be changed here.{' '}
        {isStaff ? (
          <>
            To change or withdraw an existing entry, use{' '}
            <Link
              to={`/shows/${showId}/entry-management`}
              className="font-medium underline underline-offset-2"
            >
              Entry Management
            </Link>
            .
          </>
        ) : (
          <>
            To change or withdraw an existing entry,{' '}
            <Link to={`/messages/${showId}`} className="font-medium underline underline-offset-2">
              message the show team
            </Link>
            .
          </>
        )}
      </AlertDescription>
    </Alert>
  );
};
