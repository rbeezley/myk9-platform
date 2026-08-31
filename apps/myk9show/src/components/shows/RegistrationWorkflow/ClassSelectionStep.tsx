import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useExistingEntries } from '@/hooks/useExistingEntries';
import { compareLevels } from '@/utils/schedule-summary';
import { useCartStore, useCartItems } from '@/store/cartStore';
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
  getTotalFeesForDog,
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
  DogCartSummary,
  OverallCartSummary,
} from './ClassSelectionStep.components';
import { AlreadyEnteredNotice } from './AlreadyEnteredNotice';
import { resolveConfiguredRegistryId } from '@/features/registries';
import { getRegistrationPrerequisite } from './registrationPrerequisite';
import { Skeleton } from '@/components/common/SkeletonLoaders';
import { AddEditRegistrationDialog } from '@/components/dogs/AddEditRegistrationDialog';
import { useInlineDogRegistration } from './useInlineDogRegistration';
import '@/styles/myk9-registration-workflow.css';
import { buildAvailabilityMap, isAvailabilityUnreadable } from './ClassSelectionStep.availability';

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
  const { isSecretary, isAdmin } = useAuthContext();
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
  const [, setIsAddingToCart] = useState<string | null>(null);
  const { registrationDogId, openRegistrationEditor, closeRegistrationEditor, saveRegistration } =
    useInlineDogRegistration(refetch);

  const cartItems = useCartItems();
  const cartShowId = useCartStore(state => state.cart?.show_id ?? null);
  const cartExhibitorId = useCartStore(state => state.cart?.exhibitor_id ?? null);
  const cartIsLoading = useCartStore(state => state.isLoading);
  const loadCart = useCartStore(state => state.loadCart);
  const createCart = useCartStore(state => state.createCart);
  const addItem = useCartStore(state => state.addItem);
  const removeItem = useCartStore(state => state.removeItem);

  const { getExistingEntry, getEntriesForDog } = useExistingEntries(showId);
  const { classes: availabilityClasses, isLoading: availabilityLoading } =
    useClassAvailability(showId);

  const show = shows.find(s => s.id === showId);
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
    const defaultFee = getClassFee(show, { entryFee: undefined });

    for (const trial of showTrials) {
      const replicatedClasses: RegistrationClassSource[] = trialClasses[trial.id] || [];
      const queryBackedClasses: RegistrationClassSource[] = queryClasses
        .filter(cls => cls.trialId === trial.id)
        .map(cls => ({
          id: cls.id,
          element: cls.element,
          level: cls.level,
          section: cls.section,
          className: cls.className,
        }));
      const availabilityBackedClasses: RegistrationClassSource[] = availabilityClasses
        .filter(cls => cls.trialId === trial.id)
        .map(cls => ({
          id: cls.classId,
          element: cls.element ?? undefined,
          level: cls.level,
          section: cls.section ?? undefined,
          className: cls.className,
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
        }[]
      >();

      const sorted = classes.slice().sort((a, b) => {
        const elemCmp = (a.element || '').localeCompare(b.element || '');
        if (elemCmp !== 0) return elemCmp;
        const levelCmp = compareLevels(a.level || '', b.level || '');
        if (levelCmp !== 0) return levelCmp;
        return (a.section || '').localeCompare(b.section || '');
      });

      for (const cls of sorted) {
        const level = cls.level || cls.className || 'Class';
        const element = cls.element || cls.className || 'Class';
        const displayLabel = buildDisplayLabel(level, cls.section);
        const entry = {
          classId: cls.id,
          className: cls.className || '',
          level,
          section: cls.section || '',
          displayLabel: displayLabel ?? '',
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
  }, [showTrials, trialClasses, queryClasses, availabilityClasses, show]);
  const hasClassGroups = useMemo(
    () => Array.from(classesByTrialElement.values()).some(groups => groups.length > 0),
    [classesByTrialElement]
  );

  const exhibitorId = exhibitorProfile?.id;
  useEffect(() => {
    const initializeCart = async () => {
      if (!exhibitorId || !showId) return;
      const existingCart = await loadCart(showId, exhibitorId);
      if (!existingCart) {
        await createCart(showId, exhibitorId);
      }
    };
    initializeCart();
  }, [showId, exhibitorId, loadCart, createCart]);

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
  const hasReconciledFromCart = useRef(false);
  useEffect(() => {
    if (hasReconciledFromCart.current) return;
    if (!useCartFlow) return;
    if (cartIsLoading) return;
    if (cartShowId !== showId || cartExhibitorId !== exhibitorId) return;
    if (cartItems.length === 0) return;
    const reconstructed = reconcileCartToSelections(cartItems, classSelections);
    if (!reconstructed) return;
    hasReconciledFromCart.current = true;
    onSelectionChange(reconstructed);
  }, [
    cartItems,
    classSelections,
    useCartFlow,
    cartIsLoading,
    cartShowId,
    cartExhibitorId,
    showId,
    exhibitorId,
    onSelectionChange,
  ]);

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
      setAddingItem: setIsAddingToCart,
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
          const dogCartCount = getCartCountForDog(cartItems, dogId);
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
                                    ...(avail !== undefined && {
                                      isFull: avail.isFull,
                                      waitlistCount: avail.waitlistCount,
                                      allowsWaitlist: avail.allowsWaitlist,
                                    }),
                                  };
                                })}
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
                  <DogCartSummary
                    cartCount={dogCartCount}
                    totalFees={getTotalFeesForDog(cartItems, dogId)}
                  />
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

      <OverallCartSummary
        totalItems={cartItems.length}
        totalFees={selectedDogs.reduce(
          (total, dogId) => total + getTotalFeesForDog(cartItems, dogId),
          0
        )}
      />

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
