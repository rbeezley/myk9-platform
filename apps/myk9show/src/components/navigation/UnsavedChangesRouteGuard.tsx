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

interface UnsavedChangesRouteGuardProps {
  isDirty: boolean;
  subject: string;
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
      if (existing && existing.isDirty === guard.isDirty && existing.subject === guard.subject) {
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
export function UnsavedChangesRouteGuard({ isDirty, subject }: UnsavedChangesRouteGuardProps) {
  const dataRouterContext = useContext(UNSAFE_DataRouterContext);
  const registry = useContext(UnsavedChangesRegistryContext);
  const id = useId();

  useEffect(() => {
    if (!registry || !dataRouterContext) return;

    registry.register({ id, isDirty, subject });
    return () => registry.unregister(id);
  }, [dataRouterContext, id, isDirty, registry, subject]);

  if (!dataRouterContext || registry) return null;

  return <DataRouterUnsavedChangesGuard isDirty={isDirty} subject={subject} />;
}

function DataRouterUnsavedChangesBlocker({
  children,
  guards,
}: {
  children: React.ReactNode;
  guards: RegisteredGuard[];
}) {
  const isDirty = guards.some(guard => guard.isDirty);
  const subject = guards.find(guard => guard.isDirty)?.subject ?? 'this page';
  const blocker = useBlocker(isDirty);

  return (
    <>
      {children}
      <BlockedNavigationDialog blocker={blocker} subject={subject} />
    </>
  );
}

function DataRouterUnsavedChangesGuard({ isDirty, subject }: UnsavedChangesRouteGuardProps) {
  const blocker = useBlocker(isDirty);

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
