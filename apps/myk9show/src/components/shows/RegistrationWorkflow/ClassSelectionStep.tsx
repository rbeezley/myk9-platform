import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { buildClassDisambiguator } from '@/features/_shared/classLabel';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useEntryWindowTimezone } from '@/hooks/useEntryWindowTimezone';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useExistingEntries } from '@/hooks/useExistingEntries';
import { compareLevels } from '@/utils/schedule-summary';
import { useCartStore, useCartItems } from '@/store/cartStore';
import type { EnsureCartResult } from '@/store/cartStore.types';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import { useClassAvailability } from '@/hooks/useClassAvailability';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { toast } from 'sonner';
import { InlineHandlerSection } from './InlineHandlerSection';
import type {
  ClassSelectionStepProps,
  ElementGroup,
  RegistrationClassSource,
} from './ClassSelectionStep.types';
import {
  getDogById,
  isClassSelected,
  getClassFee,
  getCartCountForDog,
  buildDisplayLabel,
  reconcileCartToSelections,
  toggleClassSelection,
} from './ClassSelectionStep.helpers';
import {
  DogTabTrigger,
  TrialSection,
  NoTrialsAlert,
  NoClassesAlert,
  AvailabilityUnreadableNotice,
  ElementCard,
} from './ClassSelectionStep.components';
import { AlreadyEnteredNotice } from './AlreadyEnteredNotice';
import { resolveConfiguredRegistryId } from '@/features/registries';
import { getRegistrationPrerequisite } from './registrationPrerequisite';
import { Skeleton } from '@/components/common/SkeletonLoaders';
import { AddEditRegistrationDialog } from '@/components/dogs/AddEditRegistrationDialog';
import { useInlineDogRegistration } from './useInlineDogRegistration';
import '@/styles/myk9-registration-workflow.css';
import {
  buildAvailabilityMap,
  getClassEntryWindow,
  isAvailabilityUnreadable,
} from './ClassSelectionStep.availability';
import { buildFullChipReason } from './ClassSelectionStep.fullReason';
import { useCartToggleGate } from './ClassSelectionStep.cartReady';
import { canManageShowSurface } from '@/utils/roleScopes';
import { ClosedClassRemovedNotice } from '@/components/cart/ClosedClassRemovedNotice';

export type { ClassSelectionStepProps } from './ClassSelectionStep.types';

export const ClassSelectionStep: React.FC<ClassSelectionStepProps> = ({
  selectedDogs,
  classSelections,
  onSelectionChange,
  showId,
  handlerAssignments,
  onHandlerAssignmentChange,
  workflowMode,
}) => {
  const { dogs, refetch } = useDogStoreCompat();
  const { shows = [] } = useShowStore();
  const trials = useTrialStore(s => s.trials);
  const trialClasses = useTrialStore(s => s.trialClasses);
  const { classes: queryClasses = [] } = useClassStoreCompat();
  const { isSecretary, isAdmin, hasRole, userWithRoles } = useAuthContext();
  const { profile: exhibitorProfile } = useExhibitorProfile();
  const { status: syncStatus } = useReplicationSync();
  // 'idle' means sync hasn't started yet (status initialises to idle before
  // the first triggerSync() fires). Treat idle + syncing as loading so we
  // don't flash "no trials" before the first download completes.
  const isTrialsSyncing =
    syncStatus.isSyncing ||
    syncStatus.tablesStatus.trials === 'syncing' ||
    syncStatus.tablesStatus.trials === 'idle';

  const [activeTab, setActiveTab] = useState(selectedDogs[0] || '');
  /**
   * Key of the cart add currently in flight, or null.
   *
   * A ref, not `useState`. This was `const [, setIsAddingToCart] = useState(...)`
   * -- the value was discarded, so nothing could read it and the in-flight guard
   * did not exist; a fast double-click on an unselected chip fired two inserts
   * and the second died on the unique index (MYK9-530). A ref is also the
   * correct shape even had the value been kept: two clicks in the same React
   * batch read the same stale state, while a ref is written synchronously.
   * Nothing renders from it, so no state is needed.
   */
  const addingItemRef = useRef<string | null>(null);
  const { registrationDogId, openRegistrationEditor, closeRegistrationEditor, saveRegistration } =
    useInlineDogRegistration(refetch);

  const cartItems = useCartItems();
  const cartShowId = useCartStore(state => state.cart?.show_id ?? null);
  const cartExhibitorId = useCartStore(state => state.cart?.exhibitor_id ?? null);
  const cartIsLoading = useCartStore(state => state.isLoading);
  const ensureCart = useCartStore(state => state.ensureCart);
  const addItem = useCartStore(state => state.addItem);
  const removeItem = useCartStore(state => state.removeItem);

  const { getExistingEntry, getEntriesForDog } = useExistingEntries(showId);
  const { classes: availabilityClasses, isLoading: availabilityLoading } =
    useClassAvailability(showId);

  const show = shows.find(s => s.id === showId);
  const { timeZone: entryWindowTimezone, isReady: entryWindowTimezoneReady } =
    useEntryWindowTimezone(showId);

  /**
   * Show officials take late entries at the desk for a class already in the
   * ring, so the started-class guard (MYK9-516) does not apply to them.
   *
   * SCOPED to the show's owning club, not `isSecretary || isAdmin`. The server's
   * `v_is_official` is `is_site_admin() OR is_show_secretary(show) OR
   * is_club_admin(club)` — all club-scoped but the first — so a global role
   * boolean would hand Club A's secretary an enabled chip on Club B's show and
   * the RPC would then refuse the entry with a 403. That is the exact shape of
   * MYK9-123 / MYK9-458, and `scopedManageGate.test.ts` exists to catch it.
   *
   * `canManageShowSurface` denies while `clubId` is unknown, which is the right
   * direction here: a secretary briefly sees the chip disabled and explained,
   * rather than an exhibitor briefly seeing it enabled.
   */
  const isStaff = canManageShowSurface({
    isSecretary,
    isAdmin,
    hasRole,
    userWithRoles,
    clubId: show?.clubId,
  });
  const showTrials = useMemo(
    () =>
      (trials || [])
        .filter(t => t.showId === showId)
        .sort((a, b) => {
          const orderA = a.order ? parseInt(a.order, 10) : Infinity;
          const orderB = b.order ? parseInt(b.order, 10) : Infinity;
          if (orderA !== orderB) return orderA - orderB;
          return (a.trialDate || '').localeCompare(b.trialDate || '');
        }),
    [trials, showId]
  );

  const [expandedTrials, setExpandedTrials] = useState<Set<string>>(
    () => new Set(showTrials.map(t => t.id))
  );

  const toggleTrial = useCallback((trialId: string) => {
    setExpandedTrials(prev => {
      const next = new Set(prev);
      if (next.has(trialId)) {
        next.delete(trialId);
      } else {
        next.add(trialId);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (showTrials.length === 0) return;
    setExpandedTrials(prev => {
      if (prev.size > 0) return prev; // already has expansions, don't override
      return new Set(showTrials.map(t => t.id));
    });
    // only on length change, not full deep compare
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTrials.length]);

  const classesByTrialElement = useMemo(() => {
    const result = new Map<string, ElementGroup[]>();
    // The fee tier is decided in the SHOW's timezone. `show` comes from the
    // show store and carries no zone, so this priced every chip in whatever
    // zone the browser happens to be in while the payment step and the server
    // used the show's own — a third answer to the one question MYK9-642 exists
    // to make singular (L-F2).
    // `entryWindowTimezoneReady`, not just the zone (N-F4). No chip renders in
    // that state today because `showTrials` comes from the same store and is
    // empty whenever the read is unfinished — but that is an invariant of the
    // store, not of this component, and the error branch already produces
    // "trials populated, not ready". Priced from an unresolved zone this would
    // be a third answer to the question MYK9-642 exists to make singular.
    const defaultFee = getClassFee(
      show && entryWindowTimezoneReady ? { ...show, entryWindowTimezone } : undefined,
      { entryFee: undefined }
    );

    // Keyed by class id, NOT read off the chosen source: the step prefers the
    // replicated class list, and only the availability read knows whether dogs
    // are in the ring. Looking it up here keeps the guard working on every
    // source rather than only the one the step falls back to (MYK9-516).
    const startedByClassId = new Map<string, boolean>(
      availabilityClasses.map(cls => [cls.classId, cls.hasStarted])
    );

    for (const trial of showTrials) {
      // Mapped rather than assigned straight through: `SyncableTrialClass`
      // spells the stored name `name`, and `RegistrationClassSource` spells it
      // `className`. Assigning the array directly type-checks — `className` is
      // optional — and silently leaves every name undefined, which disables the
      // disambiguator on the path this branch PREFERS over the two fallbacks
      // below. Found in review of #2196.
      const replicatedClasses: RegistrationClassSource[] = (trialClasses[trial.id] || []).map(
        cls => ({
          id: cls.id,
          element: cls.element,
          level: cls.level,
          section: cls.section,
          className: cls.name,
          status: cls.status,
        })
      );
      const queryBackedClasses: RegistrationClassSource[] = queryClasses
        .filter(cls => cls.trialId === trial.id)
        .map(cls => ({
          id: cls.id,
          element: cls.element,
          level: cls.level,
          section: cls.section,
          className: cls.className,
          status: cls.status,
        }));
      const availabilityBackedClasses: RegistrationClassSource[] = availabilityClasses
        .filter(cls => cls.trialId === trial.id)
        .map(cls => ({
          id: cls.classId,
          element: cls.element ?? undefined,
          level: cls.level,
          section: cls.section ?? undefined,
          className: cls.className,
          status: cls.status ?? undefined,
        }));
      const classes =
        replicatedClasses.length > 0
          ? replicatedClasses
          : queryBackedClasses.length > 0
            ? queryBackedClasses
            : availabilityBackedClasses;
      const elementMap = new Map<
        string,
        {
          classId: string;
          className: string;
          level: string;
          section: string;
          displayLabel: string;
          isClassClosed: boolean;
          classClosedReason: string | null;
        }[]
      >();

      const sorted = classes.slice().sort((a, b) => {
        const elemCmp = (a.element || '').localeCompare(b.element || '');
        if (elemCmp !== 0) return elemCmp;
        const levelCmp = compareLevels(a.level || '', b.level || '');
        if (levelCmp !== 0) return levelCmp;
        return (a.section || '').localeCompare(b.section || '');
      });

      // Scoped to this trial's classes: two chips only compete for one label
      // within the trial the exhibitor is choosing from. Returns '' unless a
      // class would otherwise be indistinguishable from a different one, so
      // ordinary chips keep reading "Novice B" rather than repeating the
      // class's stored name back at the reader.
      const disambiguate = buildClassDisambiguator(
        sorted.map(cls => ({
          name: cls.className,
          element: cls.element || cls.className || 'Class',
          level: cls.level || cls.className || 'Class',
          section: cls.section,
        }))
      );

      for (const cls of sorted) {
        const level = cls.level || cls.className || 'Class';
        const element = cls.element || cls.className || 'Class';
        const displayLabel = buildDisplayLabel(
          level,
          cls.section,
          disambiguate({ name: cls.className, element, level, section: cls.section })
        );
        // A class the judge has already started is not enterable, whatever the
        // entry-close DATE says (MYK9-516). Staff keep taking gate entries.
        const entryWindow = getClassEntryWindow({
          status: cls.status,
          hasStarted: startedByClassId.get(cls.id) ?? false,
          isStaff,
        });
        const entry = {
          classId: cls.id,
          className: cls.className || '',
          level,
          section: cls.section || '',
          displayLabel: displayLabel ?? '',
          isClassClosed: !entryWindow.enterable,
          classClosedReason: entryWindow.reason,
        };
        const existing = elementMap.get(element);
        if (existing) {
          existing.push(entry);
        } else {
          elementMap.set(element, [entry]);
        }
      }

      const elementGroups: ElementGroup[] = [];
      for (const [element, classEntries] of elementMap) {
        const isSingleClass = classEntries.length === 1 && !classEntries[0].displayLabel;
        elementGroups.push({
          element,
          fee: defaultFee,
          levels: classEntries.map(entry => ({
            ...entry,
            isSelected: false,
            isAlreadyEntered: false,
          })),
          isSingleClass,
        });
      }

      result.set(trial.id, elementGroups);
    }

    return result;
  }, [
    showTrials,
    trialClasses,
    queryClasses,
    availabilityClasses,
    show,
    entryWindowTimezone,
    entryWindowTimezoneReady,
    isStaff,
  ]);
  const hasClassGroups = useMemo(
    () => Array.from(classesByTrialElement.values()).some(groups => groups.length > 0),
    [classesByTrialElement]
  );

  const exhibitorId = exhibitorProfile?.id;
  const [cartOpenAttempt, setCartOpenAttempt] = useState(0);
  // What the opener said, which is the ONLY thing this step renders its cart
  // state from — the alert AND the chips. `null` means "not asked yet / in
  // flight"; everything else is a `ready` cart or a `failed` message, and the
  // opener is bounded in time, so "in flight" cannot be permanent (MYK9-581).
  const [cartOpen, setCartOpen] = useState<EnsureCartResult | null>(null);
  const [cartReopening, setCartReopening] = useState(false);
  const openedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    // One call, not load-then-create: the two-step opener raced itself and the
    // loser's INSERT died on the active-cart unique index (MYK9-581).
    // `ensureCart` also RECOVERS a cart whose hold has lapsed, with its items,
    // rather than replacing it with an empty one.
    //
    // No `.catch`: `ensureCart` resolves `{ kind: 'failed' }` instead of
    // rejecting, pinned by `cartStore.ensureCart.test.ts`.
    if (!exhibitorId || !showId) return;
    const key = `${showId}:${exhibitorId}`;
    let cancelled = false;
    if (openedKeyRef.current === key) {
      // A retry of the SAME cart: keep the alert and the button on screen and
      // say the retry is running, rather than blanking both back to the silent
      // state the exhibitor just clicked to escape (review D4).
      setCartReopening(true);
    } else {
      openedKeyRef.current = key;
      setCartOpen(null);
    }
    void ensureCart(showId, exhibitorId).then(result => {
      if (cancelled) return;
      setCartOpen(result);
      setCartReopening(false);
    });
    return () => {
      cancelled = true;
    };
  }, [showId, exhibitorId, ensureCart, cartOpenAttempt]);

  const availabilityUnreadable = isAvailabilityUnreadable({
    isLoading: availabilityLoading,
    rowCount: availabilityClasses.length,
  });
  const availabilityMap = useMemo(
    () => buildAvailabilityMap(availabilityClasses),
    [availabilityClasses]
  );

  // The cart requires classes to exist in Supabase (FK on entry_cart_items.class_id), but
  // wizard-created classes may only be in the replication layer. Local selection state is
  // sufficient — the cart is only needed for exhibitor self-service persistence.
  const useCartFlow = !!exhibitorId && !isSecretary && !isAdmin;

  // When returning to the form in a new session, the Supabase cart loads with
  // persisted items but classSelections (wizard-level state) starts empty.
  // isClassSelected() shows them as checked (inCart), but canProceed() only
  // reads classSelections — so Next stays grayed out. Reconcile once on load.
  // The global cart may still hold a previous show's items while this show's cart loads.
  // Reconciling against stale items would copy the wrong show's classes and
  // set the ref, preventing a second reconcile once the right cart arrives.
  // One predicate for "the held cart is this show's and this exhibitor's, and
  // has settled": the reconcile reads it, `handleClassToggle` writes through
  // it, and the chips render disabled while it is false (MYK9-542).
  const { cartReady, blockedReason, onBlockedByCart } = useCartToggleGate({
    useCartFlow,
    cartOpen,
    cartIsLoading,
    cartShowId,
    cartExhibitorId,
    showId,
    exhibitorId,
  });

  const hasReconciledFromCart = useRef(false);
  useEffect(() => {
    if (hasReconciledFromCart.current) return;
    if (!useCartFlow) return;
    if (!cartReady) return;
    if (cartItems.length === 0) return;
    const reconstructed = reconcileCartToSelections(cartItems, classSelections);
    if (!reconstructed) return;
    hasReconciledFromCart.current = true;
    onSelectionChange(reconstructed);
  }, [cartItems, classSelections, useCartFlow, cartReady, onSelectionChange]);

  const handleClassToggle = async (
    dogId: string,
    trialId: string,
    classId: string,
    entryFee: number
  ) => {
    await toggleClassSelection({
      useCartFlow,
      cartItems,
      classSelections,
      dogId,
      trialId,
      classId,
      entryFee,
      onSelectionChange,
      addItem,
      removeItem,
      setAddingItem: (itemKey: string | null) => {
        addingItemRef.current = itemKey;
      },
      isAddInFlight: () => addingItemRef.current !== null,
      isCartReady: cartReady,
      onBlockedByCart,
      notifyAdded: () =>
        toast.success('Added to cart', { description: 'Class added to your cart' }),
      notifyError: message => toast.error(message),
    });
  };

  if (selectedDogs.length === 0) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>Please select at least one dog in the previous step.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Select Classes</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Choose which classes each dog will enter. Select all that apply.
        </p>
      </div>

      {useCartFlow && <ClosedClassRemovedNotice />}

      {useCartFlow && cartOpen?.kind === 'failed' && (
        // Rendered from the opener's own result, not from a separate error flag
        // that some failure path might forget to set: without this the chips
        // simply stayed disabled behind "Loading your cart…" and nothing ever
        // said why (rounds 2 and 3).
        <Alert variant="destructive">
          <Info className="h-4 w-4" />
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>We couldn’t open your cart, so classes can’t be selected yet.</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={cartReopening}
              onClick={() => setCartOpenAttempt(attempt => attempt + 1)}
            >
              {cartReopening ? 'Retrying…' : 'Try again'}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          New to this sport? Start with Novice or the entry-level class named by the show. Move to
          higher levels only after earning the required qualifications.
        </AlertDescription>
      </Alert>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex gap-0 border-0 border-b border-border bg-transparent h-auto p-0 overflow-x-auto">
          {selectedDogs.map(dogId => (
            <DogTabTrigger
              key={dogId}
              dogId={dogId}
              dog={getDogById(dogs, dogId)}
              isActive={activeTab === dogId}
              existingEntryCount={getEntriesForDog(dogId).length}
              cartCount={getCartCountForDog(cartItems, dogId)}
            />
          ))}
        </TabsList>

        {selectedDogs.map(dogId => {
          const existingEntryCount = getEntriesForDog(dogId).length;
          const dog = getDogById(dogs, dogId);
          const dogName = dog?.callName || dog?.name || 'This dog';

          return (
            <TabsContent key={dogId} value={dogId}>
              <Card>
                <CardContent className="pt-4">
                  {existingEntryCount > 0 && (
                    <AlreadyEnteredNotice
                      showId={showId}
                      dogName={dogName}
                      workflowMode={workflowMode}
                    />
                  )}
                  {availabilityUnreadable && hasClassGroups && <AvailabilityUnreadableNotice />}
                  {showTrials.length === 0 && isTrialsSyncing ? (
                    <div role="status" aria-label="Loading trials" className="space-y-3 py-2">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton key={index} className="h-24 rounded-lg" />
                      ))}
                    </div>
                  ) : showTrials.length === 0 ? (
                    <NoTrialsAlert isOrganizer={isSecretary || isAdmin} />
                  ) : !hasClassGroups ? (
                    <NoClassesAlert
                      trialCount={showTrials.length}
                      isOrganizer={isSecretary || isAdmin}
                    />
                  ) : (
                    <div className="space-y-2">
                      {showTrials.map(trial => {
                        const elementGroups = classesByTrialElement.get(trial.id) || [];
                        if (elementGroups.length === 0) return null;

                        const selectedCount = elementGroups.reduce((count, group) => {
                          return (
                            count +
                            group.levels.filter(l =>
                              isClassSelected(dogId, l.classId, cartItems, classSelections)
                            ).length
                          );
                        }, 0);

                        // Depends only on the trial, so it is resolved once
                        // here rather than per level inside the map below.
                        const trialRegistryId = resolveConfiguredRegistryId(trial.registryId);

                        return (
                          <TrialSection
                            key={`${trial.id}-${dogId}`}
                            trialName={trial.name || 'Unnamed Trial'}
                            trialDate={trial.trialDate}
                            trialType={trial.trialType}
                            selectedCount={selectedCount}
                            isExpanded={expandedTrials.has(trial.id)}
                            onToggle={() => toggleTrial(trial.id)}
                          >
                            {elementGroups.map(group => (
                              <ElementCard
                                key={group.element}
                                element={group.element}
                                fee={group.fee}
                                isSingleClass={group.isSingleClass}
                                levels={group.levels.map(l => {
                                  const avail = availabilityMap.get(l.classId);
                                  const prerequisite = getRegistrationPrerequisite({
                                    registrations: dog?.registrations,
                                    registryId: trialRegistryId,
                                    trialType: trial.trialType,
                                    className: l.className,
                                    element: group.element,
                                    level: l.level,
                                  });
                                  return {
                                    ...l,
                                    isSelected: isClassSelected(
                                      dogId,
                                      l.classId,
                                      cartItems,
                                      classSelections
                                    ),
                                    isAlreadyEntered: !!getExistingEntry(dogId, l.classId),
                                    isRegistrationBlocked: !prerequisite.allowed,
                                    registrationGuidance: prerequisite.message,
                                    isAvailabilityUnknown:
                                      availabilityLoading || avail === undefined,
                                    ...(avail !== undefined && {
                                      isFull: avail.isFull,
                                      waitlistCount: avail.waitlistCount,
                                      allowsWaitlist: avail.allowsWaitlist,
                                      // A "Full" badge with no explanation is a
                                      // dead end; the sentence comes from the
                                      // server's own payload (MYK9-515).
                                      fullReason: buildFullChipReason({
                                        classId: l.classId,
                                        availability: availabilityClasses,
                                        secretaryContact: show?.clubEmail,
                                      }),
                                    }),
                                  };
                                })}
                                cartBlockedReason={blockedReason}
                                onToggle={classId =>
                                  handleClassToggle(dogId, trial.id, classId, group.fee)
                                }
                                onAddRegistration={() => openRegistrationEditor(dogId)}
                              />
                            ))}
                          </TrialSection>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>

      {handlerAssignments && onHandlerAssignmentChange && (
        <InlineHandlerSection
          selectedDogs={selectedDogs}
          classSelections={classSelections}
          handlerAssignments={handlerAssignments}
          onHandlerAssignmentChange={onHandlerAssignmentChange}
        />
      )}

      <div className="relative z-[60]">
        <AddEditRegistrationDialog
          open={registrationDogId !== null}
          onOpenChange={open => !open && closeRegistrationEditor()}
          onSave={saveRegistration}
        />
      </div>
    </div>
  );
};
