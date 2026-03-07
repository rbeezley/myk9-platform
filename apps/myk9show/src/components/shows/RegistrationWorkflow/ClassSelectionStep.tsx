import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useExistingEntries } from '@/hooks/useExistingEntries';
import { useClassAvailability } from '@/hooks/useClassAvailability';
import { useCartStore, useCartItems } from '@/stores/cartStore';
import { useEntryEligibility } from '@/hooks/useEntryEligibility';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import { joinWaitlist } from '@/services/database/queries/waitlistQueries';
import { toast } from 'sonner';
import { InlineHandlerSection } from './InlineHandlerSection';
import type { ClassSelectionStepProps } from './ClassSelectionStep.types';
import {
  buildAvailabilityMap,
  buildClassesWithTrials,
  getDogById,
  getSelectionForDog,
  isClassSelected,
  getClassFee,
  findCartItem,
  getTotalFeesForDog,
  getCartCountForDog,
  addClassToSelections,
  removeClassFromSelections,
  updateJumpHeightInSelections,
} from './ClassSelectionStep.helpers';
import {
  DogTabTrigger,
  TrialSectionHeader,
  NoTrialsAlert,
  NoClassesAlert,
  ClassCardRow,
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
  const { trials = [] } = useTrialStore();
  const { classes = [] } = useClassStoreCompat();
  const { user } = useAuthContext();
  const { profile: exhibitorProfile } = useExhibitorProfile();

  const [activeTab, setActiveTab] = useState(selectedDogs[0] || '');
  const [isAddingToCart, setIsAddingToCart] = useState<string | null>(null);
  const [joiningWaitlist, setJoiningWaitlist] = useState<string | null>(null);

  // Cart store
  const cartItems = useCartItems();
  const loadCart = useCartStore(state => state.loadCart);
  const createCart = useCartStore(state => state.createCart);
  const addItem = useCartStore(state => state.addItem);
  const removeItem = useCartStore(state => state.removeItem);

  // Check for existing entries
  const { getExistingEntry, getEntriesForDog } = useExistingEntries(showId);

  // Fetch class availability data
  const { classes: classAvailability, isLoading: isLoadingAvailability } =
    useClassAvailability(showId);

  const show = shows.find(s => s.id === showId);
  const showTrials = useMemo(
    () => (trials || []).filter(t => t.showId === showId),
    [trials, showId]
  );

  const classesWithTrials = useMemo(
    () => buildClassesWithTrials(showTrials, classes, show?.startDate),
    [showTrials, classes, show?.startDate]
  );

  const allClassIds = useMemo(
    () => classesWithTrials.map(c => c.classData.id),
    [classesWithTrials]
  );

  const { checkEligibility } = useEntryEligibility({
    showId,
    dogIds: selectedDogs,
    classIds: allClassIds,
  });

  const availabilityMap = useMemo(
    () => buildAvailabilityMap(classAvailability),
    [classAvailability]
  );

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

  const handleClassToggle = async (
    dogId: string,
    trialId: string,
    classId: string,
    entryFee: number
  ) => {
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

  const handleJoinWaitlist = async (dogId: string, classId: string) => {
    if (!user?.id) {
      toast.error('You must be logged in to join a waitlist');
      return;
    }
    const key = `${dogId}-${classId}`;
    setJoiningWaitlist(key);
    try {
      const { error, position } = await joinWaitlist(classId, dogId, user.id);
      if (error) {
        toast.error('Failed to join waitlist', { description: error.message });
      } else {
        toast.success(`Added to waitlist (position #${position})`);
      }
    } finally {
      setJoiningWaitlist(null);
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
        <p className="text-sm text-gray-600 mt-1">
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
          const dog = getDogById(dogs, dogId);
          const selection = getSelectionForDog(classSelections, dogId);
          const dogCartCount = getCartCountForDog(cartItems, dogId);

          return (
            <TabsContent key={dogId} value={dogId}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Classes for {dog?.callName || dog?.name}
                    {dog?.registrations?.[0]?.registeredName &&
                      ` "${dog.registrations[0].registeredName}"`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[350px] pr-4">
                    <div className="space-y-6">
                      {showTrials.length === 0 ? (
                        <NoTrialsAlert />
                      ) : classesWithTrials.length === 0 ? (
                        <NoClassesAlert trialCount={showTrials.length} />
                      ) : (
                        showTrials.map(trial => {
                          const trialClasses = classesWithTrials.filter(
                            c => c.trial.id === trial.id
                          );
                          if (trialClasses.length === 0) return null;

                          return (
                            <div key={`${trial.id}-${dogId}`} className="space-y-3">
                              <TrialSectionHeader
                                trialName={trial.name || 'Unnamed Trial'}
                                trialType={trial.trialType}
                                classCount={trialClasses.length}
                              />
                              <div className="space-y-2 pl-6">
                                {trialClasses.map(({ classData }) => {
                                  const availability = availabilityMap.get(classData.id);
                                  const isFull = availability?.isFull ?? false;
                                  const spotsAvailable = availability?.spotsAvailable ?? 0;
                                  const entryLimit = availability?.entryLimit ?? 0;
                                  const waitlistCount = availability?.waitlistCount ?? 0;
                                  const isLowSpots =
                                    !isFull && entryLimit > 0 && spotsAvailable <= 3;
                                  const fee = getClassFee(show, classData);
                                  const itemKey = `${dogId}-${classData.id}`;
                                  const eligibilityResult =
                                    checkEligibility(dogId, classData.id) ?? undefined;
                                  const isIneligible =
                                    eligibilityResult && !eligibilityResult.isEligible;
                                  const hasWarnings =
                                    eligibilityResult && eligibilityResult.warnings.length > 0;
                                  const selectedClass = selection.selectedClasses.find(
                                    c => c.classId === classData.id
                                  );

                                  return (
                                    <ClassCardRow
                                      key={`${dogId}-${classData.id}`}
                                      dogId={dogId}
                                      classData={classData}
                                      isSelected={isClassSelected(
                                        dogId,
                                        classData.id,
                                        cartItems,
                                        classSelections
                                      )}
                                      isAlreadyEntered={!!getExistingEntry(dogId, classData.id)}
                                      isFull={isFull}
                                      isLowSpots={isLowSpots}
                                      isProcessing={
                                        isAddingToCart === itemKey || isLoadingAvailability
                                      }
                                      isIneligible={!!isIneligible}
                                      hasWarnings={!!hasWarnings}
                                      isLoadingAvailability={isLoadingAvailability}
                                      entryLimit={entryLimit}
                                      spotsAvailable={spotsAvailable}
                                      waitlistCount={waitlistCount}
                                      fee={fee}
                                      selectedJumpHeight={selectedClass?.jumpHeight}
                                      eligibilityResult={eligibilityResult}
                                      joiningWaitlistKey={joiningWaitlist}
                                      onToggle={() =>
                                        handleClassToggle(dogId, trial.id, classData.id, fee)
                                      }
                                      onJumpHeightChange={value =>
                                        onSelectionChange(
                                          updateJumpHeightInSelections(
                                            classSelections,
                                            dogId,
                                            classData.id,
                                            value
                                          )
                                        )
                                      }
                                      onJoinWaitlist={() => handleJoinWaitlist(dogId, classData.id)}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>
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
