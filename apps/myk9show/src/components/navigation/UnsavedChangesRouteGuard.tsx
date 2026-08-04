import { useContext } from 'react';
import { useBlocker, UNSAFE_DataRouterContext } from 'react-router-dom';
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

interface UnsavedChangesRouteGuardProps {
  isDirty: boolean;
  subject: string;
}

/**
 * Blocks in-app data-router navigation while unsaved work is present.
 *
 * This wrapper detects the data-router context before mounting the hook so
 * components can still be rendered in focused tests using MemoryRouter.
 */
export function UnsavedChangesRouteGuard({ isDirty, subject }: UnsavedChangesRouteGuardProps) {
  const dataRouterContext = useContext(UNSAFE_DataRouterContext);

  if (!dataRouterContext) return null;

  return <DataRouterUnsavedChangesGuard isDirty={isDirty} subject={subject} />;
}

function DataRouterUnsavedChangesGuard({ isDirty, subject }: UnsavedChangesRouteGuardProps) {
  const blocker = useBlocker(isDirty);

  if (blocker.state !== 'blocked') return null;

  return (
    <AlertDialog open onOpenChange={open => !open && blocker.reset()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave {subject}?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes in {subject}. They will be lost if you leave this page.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => blocker.reset()}>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => blocker.proceed()}
          >
            Discard changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
