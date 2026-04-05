import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useExistingEntries } from '@/hooks/useExistingEntries';
import { compareLevels } from '@/utils/schedule-summary';
import { useCartStore, useCartItems } from '@/stores/cartStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import { useClassAvailability } from '@/hooks/useClassAvailability';
import { toast } from 'sonner';
import { InlineHandlerSection } from './InlineHandlerSection';
import type { ClassSelectionStepProps, ElementGroup } from './ClassSelectionStep.types';
import type { SyncableTrialClass } from '@/store/trial-store-types';
import {
  getDogById,
  isClassSelected,
  getClassFee,
  findCartItem,
  getTotalFeesForDog,
  getCartCountForDog,
  addClassToSelections,
  removeClassFromSelections,
  buildDisplayLabel,
} from './ClassSelectionStep.helpers';
import {
  DogTabTrigger,
  TrialSection,
  NoTrialsAlert,
  NoClassesAlert,
  ElementCard,
  DogCartSummary,
  OverallCartSummary,
} from './ClassSelectionStep.components';
import '@/styles/myk9-registration-workflow.css';

export type { ClassSelectionStepProps } from './ClassSelectionStep.types';

export const ClassSelectionStep: React.FC<ClassSelectionStepProps> = ({
  selectedDogs,
  classSelections,
  onSelectionChange,
  showId,
  handlerAssignments,
  onHandlerAssignmentChange,
}) => {
  const { dogs } = useDogStoreCompat();
  const { shows = [] } = useShowStore();
  const trials = useTrialStore(s => s.trials);
  const trialClasses = useTrialStore(s => s.trialClasses);
  const { isSecretary, isAdmin } = useAuthContext();
  const { profile: exhibitorProfile } = useExhibitorProfile();

  const [activeTab, setActiveTab] = useState(selectedDogs[0] || '');
  const [, setIsAddingToCart] = useState<string | null>(null);

  const cartItems = useCartItems();
  const loadCart = useCartStore(state => state.loadCart);
  const createCart = useCartStore(state => state.createCart);
  const addItem = useCartStore(state => state.addItem);
  const removeItem = useCartStore(state => state.removeItem);

  const { getExistingEntry, getEntriesForDog } = useExistingEntries(showId);
  const { classes: availabilityClasses } = useClassAvailability(showId);

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

  // Build grouped class data: Map<trialId, ElementGroup[]>
  const classesByTrialElement = useMemo(() => {
    const result = new Map<string, ElementGroup[]>();
    const defaultFee = getClassFee(show, { entryFee: undefined });

    for (const trial of showTrials) {
      const classes: SyncableTrialClass[] = trialClasses[trial.id] || [];
      const elementMap = new Map<
        string,
        { classId: string; level: string; section: string; displayLabel: string }[]
      >();

      const sorted = classes.slice().sort((a, b) => {
        const elemCmp = a.element.localeCompare(b.element);
        if (elemCmp !== 0) return elemCmp;
        const levelCmp = compareLevels(a.level, b.level);
        if (levelCmp !== 0) return levelCmp;
        return (a.section || '').localeCompare(b.section || '');
      });

      for (const cls of sorted) {
        const displayLabel = buildDisplayLabel(cls.level, cls.section);
        const entry = {
          classId: cls.id,
          level: cls.level,
          section: cls.section,
          displayLabel: displayLabel ?? '',
        };
        const existing = elementMap.get(cls.element);
        if (existing) {
          existing.push(entry);
        } else {
          elementMap.set(cls.element, [entry]);
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
  }, [showTrials, trialClasses, show]);

  // Initialize cart on mount — uses exhibitor_profiles.id (not auth user id)
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

  const isInCart = useCallback(
    (dogId: string, classId: string) => findCartItem(cartItems, dogId, classId),
    [cartItems]
  );

  // Build a quick lookup map: classId → availability info
  const availabilityMap = useMemo(() => {
    const map = new Map<string, { isJudgeDayFull: boolean; waitlistCount: number }>();
    for (const cls of availabilityClasses) {
      map.set(cls.classId, {
        isJudgeDayFull: cls.judgeDayFull,
        waitlistCount: cls.waitlistCount,
      });
    }
    return map;
  }, [availabilityClasses]);

  // Skip cart for secretary/admin workflows. The cart requires classes to exist
  // in Supabase (FK on entry_cart_items.class_id), but wizard-created classes
  // may only be in the replication layer (IndexedDB). Local selection state is
  // sufficient — the cart is only needed for exhibitor self-service persistence.
  const useCartFlow = !!exhibitorId && !isSecretary && !isAdmin;

  const handleClassToggle = async (
    dogId: string,
    trialId: string,
    classId: string,
    entryFee: number
  ) => {
    if (!useCartFlow) {
      // Local-only toggle for secretary/admin mode
      if (isClassSelected(dogId, classId, cartItems, classSelections)) {
        onSelectionChange(removeClassFromSelections(classSelections, dogId, classId));
      } else {
        onSelectionChange(addClassToSelections(classSelections, dogId, trialId, classId));
      }
      return;
    }

    const cartItem = isInCart(dogId, classId);
    const itemKey = `${dogId}-${classId}`;

    if (cartItem) {
      const success = await removeItem(cartItem.id);
      if (success) {
        onSelectionChange(removeClassFromSelections(classSelections, dogId, classId));
      } else {
        toast.error('Failed to remove from cart');
      }
    } else {
      setIsAddingToCart(itemKey);
      const success = await addItem({
        dogId,
        classId,
        entryFeeCents: entryFee * 100,
      });
      setIsAddingToCart(null);

      if (success) {
        toast.success('Added to cart', { description: 'Class added to your cart' });
        onSelectionChange(addClassToSelections(classSelections, dogId, trialId, classId));
      } else {
        toast.error('Failed to add to cart');
      }
    }
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList
          className="flex gap-0 border-b-0 border-0 bg-transparent h-auto p-0"
          style={{ borderBottom: '0.5px solid var(--border)' }}
        >
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

          return (
            <TabsContent key={dogId} value={dogId}>
              <Card>
                <CardContent className="pt-4">
                  {showTrials.length === 0 ? (
                    <NoTrialsAlert />
                  ) : classesByTrialElement.size === 0 ? (
                    <NoClassesAlert trialCount={showTrials.length} />
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
                                  return {
                                    ...l,
                                    isSelected: isClassSelected(
                                      dogId,
                                      l.classId,
                                      cartItems,
                                      classSelections
                                    ),
                                    isAlreadyEntered: !!getExistingEntry(dogId, l.classId),
                                    ...(avail !== undefined && {
                                      isJudgeDayFull: avail.isJudgeDayFull,
                                      waitlistCount: avail.waitlistCount,
                                    }),
                                  };
                                })}
                                onToggle={classId =>
                                  handleClassToggle(dogId, trial.id, classId, group.fee)
                                }
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
    </div>
  );
};
