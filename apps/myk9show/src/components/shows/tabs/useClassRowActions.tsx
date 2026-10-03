import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListOrdered } from 'lucide-react';
import { toast } from 'sonner';
import { classActions } from '@/components/classes/classActions';
import { toRowActions, type RowAction } from '@/components/ui/RowActionMenu';
import type { ClassInfo } from './classInfo';
import { SetupRowActionsMenu } from './SetupRowActionsMenu';
import { resolveSetupClass, type SetupClassAction } from './setupClassSnapshot';

/** The trial's waitlist on Entry Management — the one place waitlists are worked. */
export function getClassWaitlistHref(showId: string, trialId: string): string {
  return `/shows/${encodeURIComponent(showId)}/entries?tab=waitlist&trial=${encodeURIComponent(trialId)}`;
}

/**
 * One class row's ⋮ menu on Setup → Classes: View waitlist, a status change (the Class
 * Management catalog), and Edit / Delete, which open the existing class panel and dialog in
 * place (MYK9-900).
 */
export function useClassRowActions(
  showId: string,
  onStatusChange: (classId: string, status: string) => void
) {
  const navigate = useNavigate();
  // Resolve the class BEFORE any dialog mounts (replicated store, else the by-id read Class
  // Details uses for a cold session), and keep that snapshot: the dialogs never re-resolve.
  const [pendingAction, setPendingAction] = useState<SetupClassAction | null>(null);
  const [hydratingClassId, setHydratingClassId] = useState<string | null>(null);
  // ONE action in flight: every row menu is locked while one resolves, and a result that is not
  // from the latest request is ignored, so a slow earlier request can never replace the dialog
  // the user is editing in.
  const latestActionRequest = useRef(0);
  const openClassAction = async (
    cls: Pick<ClassInfo, 'id' | 'trialId'>,
    action: SetupClassAction['action']
  ) => {
    const request = ++latestActionRequest.current;
    setHydratingClassId(cls.id);
    try {
      const classSnapshot = await resolveSetupClass(cls.id, cls.trialId);
      if (request !== latestActionRequest.current) return;
      if (!classSnapshot) {
        toast.error("We couldn't load this class. Please refresh and try again.");
        return;
      }
      setPendingAction({ action, classSnapshot, trialId: cls.trialId, requestId: request });
    } catch {
      // Any unexpected failure reads the same as "not found": say so, never fail silently.
      if (request === latestActionRequest.current) {
        toast.error("We couldn't load this class. Please refresh and try again.");
      }
    } finally {
      if (request === latestActionRequest.current) setHydratingClassId(null);
    }
  };

  const classRowMenu = (cls: ClassInfo) => {
    const extraActions: RowAction[] = [
      {
        id: 'view-waitlist',
        label: 'View waitlist',
        icon: <ListOrdered />,
        onSelect: () => navigate(getClassWaitlistHref(showId, cls.trialId)),
      },
      ...toRowActions(
        { id: cls.id, name: cls.name, status: cls.status },
        { onStatusChange },
        classActions
      ),
    ];
    return (
      <SetupRowActionsMenu
        subject="Class"
        rowLabel={[cls.element, cls.level, cls.section].filter(Boolean).join(' ')}
        busy={hydratingClassId === cls.id}
        locked={hydratingClassId !== null || pendingAction !== null}
        extraActions={extraActions}
        onEdit={() => void openClassAction(cls, 'edit')}
        onDelete={() => void openClassAction(cls, 'delete')}
      />
    );
  };

  return { pendingAction, setPendingAction, hydratingClassId, classRowMenu, openClassAction };
}
