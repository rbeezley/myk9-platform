import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from 'react';
import { useBlocker, UNSAFE_DataRouterContext, type Blocker } from 'react-router-dom';
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

/**
 * Counter a form owns and increments while it is navigating on its own behalf
 * (its Cancel/Discard close, or a save that routes to the saved record). The
 * route blocker reads it at navigation time, so the form can suppress the
 * "Leave this page?" prompt synchronously around the call that navigates —
 * the user already answered for those changes in the form's own dialog.
 *
 * A ref rather than a prop because React state cannot land between the click
 * handler and the navigation it dispatches in the same tick.
 */
export type SelfNavigationRef = { current: number };

interface UnsavedChangesRouteGuardProps {
  isDirty: boolean;
  subject: string;
  selfNavigationRef?: SelfNavigationRef | undefined;
}

/** True while the form owning this guard is navigating on its own behalf. */
function isSelfNavigating(guard: { selfNavigationRef?: SelfNavigationRef | undefined }): boolean {
  return (guard.selfNavigationRef?.current ?? 0) > 0;
}

interface RegisteredGuard extends UnsavedChangesRouteGuardProps {
  id: string;
}

interface UnsavedChangesRegistry {
  register: (guard: RegisteredGuard) => void;
  unregister: (id: string) => void;
}

const UnsavedChangesRegistryContext = createContext<UnsavedChangesRegistry | null>(null);

/**
 * Provides one data-router blocker for all dirty forms mounted in the app.
 * React Router evaluates a single blocker per router, so individual forms
 * register with this provider instead of competing with one another.
 */
export function UnsavedChangesRouteGuardProvider({ children }: { children: React.ReactNode }) {
  const [guards, setGuards] = useState<RegisteredGuard[]>([]);

  const register = useCallback((guard: RegisteredGuard) => {
    setGuards(current => {
      const existing = current.find(item => item.id === guard.id);
      if (
        existing &&
        existing.isDirty === guard.isDirty &&
        existing.subject === guard.subject &&
        existing.selfNavigationRef === guard.selfNavigationRef
      ) {
        return current;
      }
      return [...current.filter(item => item.id !== guard.id), guard];
    });
  }, []);

  const unregister = useCallback((id: string) => {
    setGuards(current => current.filter(item => item.id !== id));
  }, []);

  const registry = useMemo(() => ({ register, unregister }), [register, unregister]);
  const dataRouterContext = useContext(UNSAFE_DataRouterContext);

  return (
    <UnsavedChangesRegistryContext.Provider value={registry}>
      {dataRouterContext ? (
        <DataRouterUnsavedChangesBlocker guards={guards}>
          {children}
        </DataRouterUnsavedChangesBlocker>
      ) : (
        children
      )}
    </UnsavedChangesRegistryContext.Provider>
  );
}

/**
 * Blocks in-app data-router navigation while unsaved work is present.
 *
 * This wrapper detects the data-router context before mounting the hook so
 * components can still be rendered in focused tests using MemoryRouter.
 */
export function UnsavedChangesRouteGuard({
  isDirty,
  subject,
  selfNavigationRef,
}: UnsavedChangesRouteGuardProps) {
  const dataRouterContext = useContext(UNSAFE_DataRouterContext);
  const registry = useContext(UnsavedChangesRegistryContext);
  const id = useId();

  useEffect(() => {
    if (!registry || !dataRouterContext) return;

    registry.register({ id, isDirty, subject, selfNavigationRef });
    return () => registry.unregister(id);
  }, [dataRouterContext, id, isDirty, registry, subject, selfNavigationRef]);

  if (!dataRouterContext || registry) return null;

  return (
    <DataRouterUnsavedChangesGuard
      isDirty={isDirty}
      subject={subject}
      selfNavigationRef={selfNavigationRef}
    />
  );
}

function DataRouterUnsavedChangesBlocker({
  children,
  guards,
}: {
  children: React.ReactNode;
  guards: RegisteredGuard[];
}) {
  // Blocking is decided at navigation time (function form of useBlocker) so a
  // form that raises its self-navigation counter between render and its own
  // navigate() call is honoured — see SelfNavigationRef.
  const dirtyGuards = useMemo(() => guards.filter(guard => guard.isDirty), [guards]);
  const shouldBlock = useCallback(
    () => dirtyGuards.some(guard => !isSelfNavigating(guard)),
    [dirtyGuards]
  );
  const subject = dirtyGuards[0]?.subject ?? 'this page';
  const blocker = useBlocker(shouldBlock);

  return (
    <>
      {children}
      <BlockedNavigationDialog blocker={blocker} subject={subject} />
    </>
  );
}

function DataRouterUnsavedChangesGuard({
  isDirty,
  subject,
  selfNavigationRef,
}: UnsavedChangesRouteGuardProps) {
  const shouldBlock = useCallback(
    () => isDirty && !isSelfNavigating({ selfNavigationRef }),
    [isDirty, selfNavigationRef]
  );
  const blocker = useBlocker(shouldBlock);

  return <BlockedNavigationDialog blocker={blocker} subject={subject} />;
}

function BlockedNavigationDialog({ blocker, subject }: { blocker: Blocker; subject: string }) {
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
