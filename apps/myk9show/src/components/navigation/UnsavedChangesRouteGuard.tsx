import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from 'react';
import {
  useBlocker,
  UNSAFE_DataRouterContext,
  type Blocker,
  type BlockerFunction,
} from 'react-router-dom';
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

/**
 * Copy for a guard whose situation is not "unsaved edits" — e.g. records that
 * were already saved but have no entry yet. Omit it for the default
 * "Leave <subject>?" prompt.
 */
export interface UnsavedChangesDialogCopy {
  title: string;
  description: string;
  stayLabel: string;
  leaveLabel: string;
}

interface UnsavedChangesRouteGuardProps {
  isDirty: boolean;
  subject: string;
  selfNavigationRef?: SelfNavigationRef | undefined;
  /** Replaces the default dialog text. Memoize it: it is compared by identity. */
  dialog?: UnsavedChangesDialogCopy | undefined;
  /**
   * Block only navigation that changes the pathname. A search-param or hash
   * change on the same route (a `?dogId=` handoff being cleared) leaves the
   * page, and the work on it, in place.
   */
  pathScoped?: boolean | undefined;
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
        existing.selfNavigationRef === guard.selfNavigationRef &&
        existing.dialog === guard.dialog &&
        existing.pathScoped === guard.pathScoped
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
  dialog,
  pathScoped,
}: UnsavedChangesRouteGuardProps) {
  const dataRouterContext = useContext(UNSAFE_DataRouterContext);
  const registry = useContext(UnsavedChangesRegistryContext);
  const id = useId();

  useEffect(() => {
    if (!registry || !dataRouterContext) return;

    registry.register({ id, isDirty, subject, selfNavigationRef, dialog, pathScoped });
    return () => registry.unregister(id);
  }, [dataRouterContext, id, isDirty, registry, subject, selfNavigationRef, dialog, pathScoped]);

  if (!dataRouterContext || registry) return null;

  return (
    <DataRouterUnsavedChangesGuard
      isDirty={isDirty}
      subject={subject}
      selfNavigationRef={selfNavigationRef}
      dialog={dialog}
      pathScoped={pathScoped}
    />
  );
}

/** True when a path-scoped guard should let this navigation through. */
function staysOnPath(
  guard: { pathScoped?: boolean | undefined },
  args: Pick<Parameters<BlockerFunction>[0], 'currentLocation' | 'nextLocation'>
): boolean {
  return !!guard.pathScoped && args.currentLocation.pathname === args.nextLocation.pathname;
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
  // Named when the block happens, not at render: with several dirty forms
  // mounted, the one that stops this navigation is whichever is not currently
  // self-navigating, and naming a different form would tell the user they are
  // discarding work they are not.
  const [blocked, setBlocked] = useState<{
    subject: string;
    dialog?: UnsavedChangesDialogCopy | undefined;
  }>({ subject: 'this page' });
  const shouldBlock = useCallback<BlockerFunction>(
    args => {
      const blocking = dirtyGuards.find(
        guard => !isSelfNavigating(guard) && !staysOnPath(guard, args)
      );
      if (!blocking) return false;
      setBlocked({ subject: blocking.subject, dialog: blocking.dialog });
      return true;
    },
    [dirtyGuards]
  );
  const blocker = useBlocker(shouldBlock);

  return (
    <>
      {children}
      <BlockedNavigationDialog
        blocker={blocker}
        subject={blocked.subject}
        dialog={blocked.dialog}
      />
    </>
  );
}

function DataRouterUnsavedChangesGuard({
  isDirty,
  subject,
  selfNavigationRef,
  dialog,
  pathScoped,
}: UnsavedChangesRouteGuardProps) {
  const shouldBlock = useCallback<BlockerFunction>(
    args =>
      isDirty && !isSelfNavigating({ selfNavigationRef }) && !staysOnPath({ pathScoped }, args),
    [isDirty, selfNavigationRef, pathScoped]
  );
  const blocker = useBlocker(shouldBlock);

  return <BlockedNavigationDialog blocker={blocker} subject={subject} dialog={dialog} />;
}

function BlockedNavigationDialog({
  blocker,
  subject,
  dialog,
}: {
  blocker: Blocker;
  subject: string;
  dialog?: UnsavedChangesDialogCopy | undefined;
}) {
  if (blocker.state !== 'blocked') return null;
  const copy: UnsavedChangesDialogCopy = dialog ?? {
    title: `Leave ${subject}?`,
    description: `You have unsaved changes in ${subject}. They will be lost if you leave this page.`,
    stayLabel: 'Keep editing',
    leaveLabel: 'Discard changes',
  };

  return (
    <AlertDialog open onOpenChange={open => !open && blocker.reset()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => blocker.reset()}>{copy.stayLabel}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => blocker.proceed()}
          >
            {copy.leaveLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
