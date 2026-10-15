/**
 * useWizardRegistrationOwner — the wizard's local registration follows the
 * resolved owner of the selected dogs (MYK9-1162).
 *
 * The registration used to be created inside the selection handler, at the
 * moment the selection changed. The inline Add Dog panel selects a dog before
 * the roster lists it, so the owner could not be resolved then, and nothing
 * retried once the roster caught up: Submit entry found no registration.
 * Deriving it from `ownerResolution` makes it hold however the dog got
 * selected (picker, inline add, handoff, draft load) and whenever `dogs`
 * arrives.
 *
 * Owner-change guard: a registration whose `handlerId` no longer matches the
 * resolved owner is replaced, or submission would file the entry under the
 * PREVIOUS exhibitor. Multi-owner and orphan carts resolve `ok: false`, so no
 * registration is touched; `canProceed` surfaces those.
 */

import { useEffect, useRef } from 'react';
import type { SelectedDogsOwnerResult } from '@/features/registration/selectedDogsOwner';

export interface WizardRegistrationOwnerOptions {
  ownerResolution: SelectedDogsOwnerResult;
  hasSelection: boolean;
  registrationId: string | undefined;
  setRegistrationId: (id: string | undefined) => void;
  createRegistration: (showId: string, userId: string, handlerId: string) => { id: string };
  showId: string | undefined;
  userId: string;
}

export function useWizardRegistrationOwner(options: WizardRegistrationOwnerOptions): void {
  const { ownerResolution, hasSelection, registrationId, setRegistrationId, createRegistration } =
    options;
  const { showId, userId } = options;
  // This hook is the only writer of `registrationId`, so what it created and
  // for which owner is the whole truth. A ref (not state) also covers the
  // second effect run before the state update commits (StrictMode), which
  // would otherwise create a twin.
  const createdRef = useRef<{ ownerId: string; id: string } | null>(null);
  const ownerId = ownerResolution.ok ? ownerResolution.ownerId : undefined;

  useEffect(() => {
    if (!hasSelection || !ownerId) return;
    const created = createdRef.current;
    if (created?.ownerId === ownerId) {
      if (created.id !== registrationId) setRegistrationId(created.id);
      return;
    }

    const reg = createRegistration(showId || '', userId, ownerId);
    createdRef.current = { ownerId, id: reg.id };
    setRegistrationId(reg.id);
  }, [
    hasSelection,
    ownerId,
    registrationId,
    setRegistrationId,
    createRegistration,
    showId,
    userId,
  ]);
}
