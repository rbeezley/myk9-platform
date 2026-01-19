import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronRight, Info, CheckCircle2, Users, Clock, AlertTriangle, ShoppingCart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDogStore } from '@/store/dogStore';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { ClassSelectionData } from '@/types/show-registration-types';
import { Dog } from '@/types/dog-types';
import { cn } from '@/lib/utils';
import { useExistingEntries } from '@/hooks/useExistingEntries';
import { useClassAvailability, type ClassAvailability } from '@/hooks/useClassAvailability';
import { useCartStore, useCartItems, type CartItemWithDetails } from '@/stores/cartStore';
import { useEntryEligibility } from '@/hooks/useEntryEligibility';
import { useAuthContext } from '@/hooks/useAuthContext';
import { toast } from 'sonner';
import '@/styles/apple-registration-workflow.css';

interface ClassSelectionStepProps {
  selectedDogs: string[];
  classSelections: ClassSelectionData[];
  onSelectionChange: (selections: ClassSelectionData[]) => void;
  showId: string;
}

interface ClassWithTrial {
  classData: {
    id: string;
    name: string;
    description?: string | undefined;
    fee?: number | undefined;
    entryFee?: number | undefined;
    className?: string | undefined;
  } & Record<string, unknown>;
  trial: {
    id: string;
    name: string;
    date: string;
  };
}



export const ClassSelectionStep: React.FC<ClassSelectionStepProps> = ({
  selectedDogs,
  classSelections,
  onSelectionChange,
  showId
}) => {
  const { dogs } = useDogStore();
  const { shows = [] } = useShowStore();
  const { trials = [] } = useTrialStore();
  const { classes = [] } = useClassStoreCompat();
  const { user } = useAuthContext();

  const [activeTab, setActiveTab] = useState(selectedDogs[0] || '');
  const [isAddingToCart, setIsAddingToCart] = useState<string | null>(null);

  // Cart store
  const cartItems = useCartItems();
  const loadCart = useCartStore((state) => state.loadCart);
  const createCart = useCartStore((state) => state.createCart);
  const addItem = useCartStore((state) => state.addItem);
  const removeItem = useCartStore((state) => state.removeItem);

  // Check for existing entries
  const { getExistingEntry, getEntriesForDog } = useExistingEntries(showId);

  // Fetch class availability data
  const { classes: classAvailability, isLoading: isLoadingAvailability } = useClassAvailability(showId);

  const show = shows.find(s => s.id === showId);
  const showTrials = (trials || []).filter(t => t.showId === showId);

  // Compute classesWithTrials using useMemo (derived state, not useEffect) - must be before allClassIds
  const classesWithTrials = useMemo(() => {
    // Group classes by trial
    const grouped: ClassWithTrial[] = [];

    showTrials.forEach(trial => {
      const trialClasses = (classes || []).filter(c => c.trialId === trial.id);

      trialClasses.forEach(classData => {
        grouped.push({
          classData: {
            ...classData,
            name: (classData as unknown as { name?: string }).name || classData.className || 'Unnamed Class'
          },
          trial: { id: trial.id, name: trial.name || '', date: trial.trialDate || show?.startDate || '' }
        });
      });
    });

    return grouped;
  }, [showTrials, classes, show?.startDate]);

  // Get all class IDs for eligibility checking
  const allClassIds = useMemo(() => {
    return classesWithTrials.map(c => c.classData.id);
  }, [classesWithTrials]);

  // Fetch entry eligibility data
  const {
    checkEligibility
  } = useEntryEligibility({
    showId,
    dogIds: selectedDogs,
    classIds: allClassIds
  });

  // Initialize cart on mount
  useEffect(() => {
    const initializeCart = async () => {
      if (!user?.id || !showId) return;

      // Try to load existing cart
      const existingCart = await loadCart(showId, user.id);
      if (!existingCart) {
        // Create new cart if none exists
        await createCart(showId, user.id);
      }
    };

    initializeCart();
  }, [showId, user?.id, loadCart, createCart]);

  // Helper to check if a class is in cart for a specific dog
  const isInCart = useCallback((dogId: string, classId: string): CartItemWithDetails | undefined => {
    return cartItems.find(item => item.dog_id === dogId && item.class_id === classId);
  }, [cartItems]);

  // Get cart items for a specific dog
  const getCartItemsForDog = useCallback((dogId: string): CartItemWithDetails[] => {
    return cartItems.filter(item => item.dog_id === dogId);
  }, [cartItems]);

  // Create a map for quick availability lookup
  const availabilityMap = useMemo(() => {
    const map = new Map<string, ClassAvailability>();
    classAvailability.forEach(ca => map.set(ca.classId, ca));
    return map;
  }, [classAvailability]);

  // Helper to get availability for a class
  const getAvailability = (classId: string): ClassAvailability | undefined => {
    return availabilityMap.get(classId);
  };

  const getDogById = (dogId: string): Dog | undefined => {
    return dogs.find(d => d.id === dogId);
  };

  const getSelectionForDog = (dogId: string): ClassSelectionData => {
    return classSelections.find(s => s.dogId === dogId) || {
      dogId,
      trialId: '',
      selectedClasses: []
    };
  };

  const handleClassToggle = async (dogId: string, trialId: string, classId: string, entryFee: number) => {
    const cartItem = isInCart(dogId, classId);
    const itemKey = `${dogId}-${classId}`;

    if (cartItem) {
      // Remove from cart
      const success = await removeItem(cartItem.id);
      if (success) {
        // Also update local selection state for workflow compatibility
        const currentSelection = getSelectionForDog(dogId);
        const updatedSelection: ClassSelectionData = {
          ...currentSelection,
          selectedClasses: currentSelection.selectedClasses.filter(c => c.classId !== classId)
        };

        const newSelections = classSelections.filter(s => s.dogId !== dogId);
        if (updatedSelection.selectedClasses.length > 0) {
          newSelections.push(updatedSelection);
        }
        onSelectionChange(newSelections);
      } else {
        toast.error('Failed to remove from cart');
      }
    } else {
      // Add to cart
      setIsAddingToCart(itemKey);
      const success = await addItem({
        dogId,
        classId,
        entryFeeCents: entryFee * 100 // Convert dollars to cents
      });
      setIsAddingToCart(null);

      if (success) {
        toast.success('Added to cart', {
          description: 'Class added to your cart'
        });

        // Also update local selection state for workflow compatibility
        const currentSelection = getSelectionForDog(dogId);
        const updatedSelection: ClassSelectionData = {
          ...currentSelection,
          trialId,
          selectedClasses: [...currentSelection.selectedClasses, {
            classId,
            jumpHeight: undefined,
            moveUpRequested: false
          }]
        };

        const newSelections = classSelections.filter(s => s.dogId !== dogId);
        newSelections.push(updatedSelection);
        onSelectionChange(newSelections);
      } else {
        toast.error('Failed to add to cart');
      }
    }
  };

  const handleJumpHeightChange = (dogId: string, classId: string, jumpHeight: string) => {
    const currentSelection = getSelectionForDog(dogId);
    const updatedSelection = {
      ...currentSelection,
      selectedClasses: currentSelection.selectedClasses.map(c =>
        c.classId === classId ? { ...c, jumpHeight } : c
      )
    };
    
    const newSelections = classSelections.filter(s => s.dogId !== dogId);
    newSelections.push(updatedSelection);
    onSelectionChange(newSelections);
  };

  const isClassSelected = (dogId: string, classId: string): boolean => {
    // Check both cart and local selection for compatibility
    return !!isInCart(dogId, classId) || getSelectionForDog(dogId).selectedClasses.some(c => c.classId === classId);
  };

  const getClassFee = (classData: ClassWithTrial['classData']): number => {
    // Mock fee calculation
    return classData.entryFee || 25;
  };

  const getTotalFeesForDog = (dogId: string): number => {
    // Use cart items for total calculation
    const dogCartItems = getCartItemsForDog(dogId);
    return dogCartItems.reduce((total, item) => {
      return total + (item.entry_fee_cents / 100);
    }, 0);
  };

  // Get count of items in cart for a dog
  const getCartCountForDog = (dogId: string): number => {
    return getCartItemsForDog(dogId).length;
  };

  if (selectedDogs.length === 0) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Please select at least one dog in the previous step.
        </AlertDescription>
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
        <TabsList className="flex gap-0 border-b-0 border-0 bg-transparent h-auto p-0"
                  style={{ borderBottom: '0.5px solid var(--border)' }}>
          {selectedDogs.map(dogId => {
            const dog = getDogById(dogId);
            const isActive = activeTab === dogId;
            const existingEntriesForDog = getEntriesForDog(dogId);
            
            return (
              <TabsTrigger 
                key={dogId} 
                value={dogId} 
                className={cn(
                  "relative inline-flex items-center gap-2 px-5 py-3 -mb-[0.5px]",
                  "border-0 border-b-2 font-medium text-sm transition-all duration-200",
                  "bg-transparent rounded-none cursor-pointer",
                  isActive ? [
                    "text-blue-600 border-blue-600 font-semibold",
                    "data-[state=active]:text-blue-600 data-[state=active]:border-blue-600"
                  ] : [
                    "text-muted-foreground border-transparent hover:text-foreground",
                    "data-[state=inactive]:text-muted-foreground data-[state=inactive]:border-transparent"
                  ]
                )}
                style={{
                  borderBottomColor: isActive ? '#007AFF' : 'transparent',
                  color: isActive ? '#007AFF' : undefined
                }}
              >
                <span>{dog?.callName || dog?.name || 'Unknown'}</span>
                <div className="flex items-center gap-1">
                  {existingEntriesForDog.length > 0 && (
                    <Badge 
                      variant="default" 
                      className="h-5 px-1.5 text-xs bg-green-600"
                      title={`Already entered in ${existingEntriesForDog.length} class${existingEntriesForDog.length !== 1 ? 'es' : ''}`}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-0.5" />
                      {existingEntriesForDog.length}
                    </Badge>
                  )}
                  {getCartCountForDog(dogId) > 0 && (
                    <Badge
                      variant={isActive ? "default" : "secondary"}
                      className="h-5 px-1.5 text-xs flex items-center gap-0.5"
                      style={isActive ? { backgroundColor: '#007AFF' } : {}}
                      title={`${getCartCountForDog(dogId)} class${getCartCountForDog(dogId) !== 1 ? 'es' : ''} in cart`}
                    >
                      <ShoppingCart className="h-3 w-3" />
                      {getCartCountForDog(dogId)}
                    </Badge>
                  )}
                </div>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {selectedDogs.map(dogId => {
          const dog = getDogById(dogId);
          const selection = getSelectionForDog(dogId);
          
          return (
            <TabsContent key={dogId} value={dogId}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Classes for {dog?.callName || dog?.name}
                    {dog?.registrations?.[0]?.registeredName && ` "${dog.registrations[0].registeredName}"`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[350px] pr-4">
                    <div className="space-y-6">
                      {showTrials.length === 0 ? (
                        <Alert>
                          <Info className="h-4 w-4" />
                          <AlertDescription>
                            No trials found for this show. Please contact the show organizer.
                          </AlertDescription>
                        </Alert>
                      ) : classesWithTrials.length === 0 ? (
                        <Alert>
                          <Info className="h-4 w-4" />
                          <AlertDescription>
                            No classes available yet. Found {showTrials.length} trial{showTrials.length !== 1 ? 's' : ''} but no classes assigned.
                          </AlertDescription>
                        </Alert>
                      ) : (
                        showTrials.map(trial => {
                          const trialClasses = classesWithTrials.filter(c => c.trial.id === trial.id);
                          
                          if (trialClasses.length === 0) return null;
                          
                          return (
                          <div key={`${trial.id}-${dogId}`} className="space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b">
                              <div className="flex items-center space-x-2">
                                <ChevronRight className="h-4 w-4 text-gray-400" />
                                <h4 className="font-medium">{trial.name || 'Unnamed Trial'}</h4>
                                {trial.trialType && (
                                  <Badge variant="outline">{trial.trialType}</Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {trialClasses.length} class{trialClasses.length !== 1 ? 'es' : ''}
                              </div>
                            </div>
                            
                            <div className="space-y-2 pl-6">
                              {trialClasses.map(({ classData }) => {
                                const isSelected = isClassSelected(dogId, classData.id);
                                const selectedClass = selection.selectedClasses.find(c => c.classId === classData.id);
                                const existingEntry = getExistingEntry(dogId, classData.id);
                                const isAlreadyEntered = !!existingEntry;
                                const availability = getAvailability(classData.id);
                                const isFull = availability?.isFull ?? false;
                                const spotsAvailable = availability?.spotsAvailable ?? 0;
                                const entryLimit = availability?.entryLimit ?? 0;
                                const waitlistCount = availability?.waitlistCount ?? 0;
                                const isLowSpots = !isFull && entryLimit > 0 && spotsAvailable <= 3;
                                const fee = getClassFee(classData);
                                const itemKey = `${dogId}-${classData.id}`;
                                const isProcessing = isAddingToCart === itemKey || isLoadingAvailability;

                                // Check eligibility
                                const eligibilityResult = checkEligibility(dogId, classData.id);
                                const isIneligible = eligibilityResult && !eligibilityResult.isEligible;
                                const hasWarnings = eligibilityResult && eligibilityResult.warnings.length > 0;
                                const isDisabled = !!(isAlreadyEntered || isFull || isProcessing || isIneligible);

                                return (
                                  <div key={`${dogId}-${classData.id}`} className="space-y-2">
                                    <div className={cn(
                                      "apple-class-card apple-class-card-compact",
                                      (isSelected || isAlreadyEntered) && "selected",
                                      isAlreadyEntered && "bg-green-50 border-green-300",
                                      isFull && !isAlreadyEntered && "bg-gray-50 border-gray-200 opacity-75",
                                      isIneligible && !isAlreadyEntered && "bg-orange-50 border-orange-200 opacity-75",
                                      isProcessing && "opacity-50"
                                    )}>
                                      <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center space-x-3 flex-1">
                                          <Checkbox
                                            id={`${dogId}-${classData.id}`}
                                            checked={isSelected || isAlreadyEntered}
                                            disabled={isDisabled}
                                            onCheckedChange={() => !isDisabled && handleClassToggle(dogId, trial.id, classData.id, fee)}
                                          />
                                          <Label
                                            htmlFor={`${dogId}-${classData.id}`}
                                            className={cn(
                                              "cursor-pointer flex-1",
                                              isDisabled && "cursor-not-allowed"
                                            )}
                                          >
                                            <div className="flex items-center justify-between w-full">
                                              <div className="flex items-center gap-2">
                                                <span className={cn(
                                                  "apple-class-card-title-compact",
                                                  isAlreadyEntered && "text-green-700",
                                                  isFull && !isAlreadyEntered && "text-gray-500",
                                                  isIneligible && !isAlreadyEntered && !isFull && "text-orange-600"
                                                )}>
                                                  {classData.name}
                                                </span>
                                                {isAlreadyEntered && (
                                                  <div className="flex items-center gap-1">
                                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                                    <span className="text-xs text-green-600 font-medium">
                                                      Already Entered
                                                    </span>
                                                  </div>
                                                )}
                                                {/* Ineligible indicator */}
                                                {isIneligible && !isAlreadyEntered && (
                                                  <TooltipProvider>
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <Badge variant="outline" className="text-xs bg-orange-100 text-orange-700 border-orange-300">
                                                          <AlertTriangle className="h-3 w-3 mr-1" />
                                                          Ineligible
                                                        </Badge>
                                                      </TooltipTrigger>
                                                      <TooltipContent className="max-w-xs">
                                                        <div className="space-y-1">
                                                          <p className="font-medium">Cannot enter this class:</p>
                                                          <ul className="list-disc pl-4 text-xs">
                                                            {eligibilityResult?.reasons.map((reason, idx) => (
                                                              <li key={idx}>{reason.message}</li>
                                                            ))}
                                                          </ul>
                                                        </div>
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  </TooltipProvider>
                                                )}
                                                {/* Warnings indicator */}
                                                {hasWarnings && !isIneligible && !isAlreadyEntered && (
                                                  <TooltipProvider>
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">
                                                          <AlertTriangle className="h-3 w-3" />
                                                        </Badge>
                                                      </TooltipTrigger>
                                                      <TooltipContent className="max-w-xs">
                                                        <div className="space-y-1">
                                                          <p className="font-medium">Warnings:</p>
                                                          <ul className="list-disc pl-4 text-xs">
                                                            {eligibilityResult?.warnings.map((warning, idx) => (
                                                              <li key={idx}>{warning.message}</li>
                                                            ))}
                                                          </ul>
                                                        </div>
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  </TooltipProvider>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-2">
                                                {/* Availability badges */}
                                                {!isLoadingAvailability && entryLimit > 0 && (
                                                  <TooltipProvider>
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <Badge
                                                          variant={isFull ? "destructive" : isLowSpots ? "default" : "outline"}
                                                          className={cn(
                                                            "text-xs",
                                                            isFull && "bg-red-100 text-red-700 hover:bg-red-100",
                                                            isLowSpots && !isFull && "bg-amber-100 text-amber-700 hover:bg-amber-100",
                                                            !isFull && !isLowSpots && "text-muted-foreground"
                                                          )}
                                                        >
                                                          <Users className="h-3 w-3 mr-1" />
                                                          {isFull ? (
                                                            "Full"
                                                          ) : (
                                                            `${spotsAvailable}/${entryLimit}`
                                                          )}
                                                        </Badge>
                                                      </TooltipTrigger>
                                                      <TooltipContent>
                                                        <p>
                                                          {isFull
                                                            ? `Class is full (${entryLimit} entries)`
                                                            : isLowSpots
                                                            ? `Only ${spotsAvailable} spot${spotsAvailable !== 1 ? 's' : ''} left!`
                                                            : `${spotsAvailable} of ${entryLimit} spots available`
                                                          }
                                                        </p>
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  </TooltipProvider>
                                                )}
                                                {/* Waitlist indicator */}
                                                {waitlistCount > 0 && (
                                                  <TooltipProvider>
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <Badge variant="outline" className="text-xs text-muted-foreground">
                                                          <Clock className="h-3 w-3 mr-1" />
                                                          {waitlistCount} waiting
                                                        </Badge>
                                                      </TooltipTrigger>
                                                      <TooltipContent>
                                                        <p>{waitlistCount} {waitlistCount === 1 ? 'exhibitor' : 'exhibitors'} on waitlist</p>
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  </TooltipProvider>
                                                )}
                                                <div className={cn(
                                                  "apple-class-card-price-compact",
                                                  isAlreadyEntered && "bg-green-100 text-green-700",
                                                  isFull && !isAlreadyEntered && "bg-gray-100 text-gray-500"
                                                )}>
                                                  ${getClassFee(classData)}
                                                </div>
                                              </div>
                                            </div>
                                          </Label>
                                        </div>
                                      </div>
                                      {classData.description && (
                                        <div className="apple-class-card-details-compact">
                                          {classData.description}
                                        </div>
                                      )}

                                      {/* Full class - offer waitlist option */}
                                      {isFull && !isAlreadyEntered && (
                                        <div className="mt-2 ml-9 flex items-center gap-2">
                                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                                          <span className="text-sm text-muted-foreground">
                                            This class is full.
                                          </span>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={() => {
                                              // TODO: Implement waitlist join functionality
                                            }}
                                          >
                                            Join Waitlist
                                          </Button>
                                        </div>
                                      )}

                                      {isSelected && (classData as unknown as { requiresJumpHeight?: boolean }).requiresJumpHeight && (
                                        <div className="mt-2 ml-9">
                                          <Label className="text-sm">Jump Height</Label>
                                          <Select
                                            value={selectedClass?.jumpHeight || ''}
                                            onValueChange={(value) => handleJumpHeightChange(dogId, classData.id, value)}
                                          >
                                            <SelectTrigger className="w-32 h-8 mt-1">
                                              <SelectValue placeholder="Select..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="8">8"</SelectItem>
                                              <SelectItem value="12">12"</SelectItem>
                                              <SelectItem value="16">16"</SelectItem>
                                              <SelectItem value="20">20"</SelectItem>
                                              <SelectItem value="24">24"</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                      )}
                    </div>
                  </ScrollArea>
                  
                  {getCartCountForDog(dogId) > 0 && (
                    <div className="mt-4 p-3 bg-primary/10 rounded-lg flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          {getCartCountForDog(dogId)} class{getCartCountForDog(dogId) > 1 ? 'es' : ''} in cart
                        </span>
                      </div>
                      <span className="text-sm font-semibold">
                        Total: ${getTotalFeesForDog(dogId).toFixed(2)}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>

      {cartItems.length > 0 && (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">
                Cart Total ({cartItems.length} item{cartItems.length !== 1 ? 's' : ''}):
              </span>
            </div>
            <span className="text-lg font-semibold">
              ${selectedDogs.reduce((total, dogId) => total + getTotalFeesForDog(dogId), 0).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};