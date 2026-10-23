import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ClassInfo } from './classInfo';
import { resolveSetupClass, type SetupClassAction } from './setupClassSnapshot';

/**
 * Opens a class's edit panel in place for the show home's Edit class (MYK9-900, MYK9-956);
 * Delete lives in that panel's footer. The Classes tab's row menu that also used this is gone
 * (MYK9-1337).
 */
export function useClassRowActions() {
  // Resolve the class BEFORE the panel mounts, from the authenticated replica (hydrating a cold
  // trial first; see `resolveSetupClass`), and keep that snapshot: the panel never re-resolves.
  const [pendingAction, setPendingAction] = useState<SetupClassAction | null>(null);
  const [hydratingClassId, setHydratingClassId] = useState<string | null>(null);
  // ONE action in flight: Edit class is locked while one resolves, and a result that is not
  // from the latest request is ignored, so a slow earlier request can never replace the dialog
  // the user is editing in.
  const latestActionRequest = useRef(0);
  const openClassAction = async (cls: Pick<ClassInfo, 'id' | 'trialId'>) => {
    const request = ++latestActionRequest.current;
    setHydratingClassId(cls.id);
    try {
      const classSnapshot = await resolveSetupClass(cls.id, cls.trialId);
      if (request !== latestActionRequest.current) return;
      if (!classSnapshot) {
        toast.error("We couldn't load this class. Please refresh and try again.");
        return;
      }
      setPendingAction({ classSnapshot, trialId: cls.trialId, requestId: request });
    } catch {
      // Any unexpected failure reads the same as "not found": say so, never fail silently.
      if (request === latestActionRequest.current) {
        toast.error("We couldn't load this class. Please refresh and try again.");
      }
    } finally {
      if (request === latestActionRequest.current) setHydratingClassId(null);
    }
  };

  return { pendingAction, setPendingAction, hydratingClassId, openClassAction };
}
