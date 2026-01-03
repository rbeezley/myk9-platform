import React, { useState, useEffect } from 'react';
import { ChevronRight, Info, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDogStore } from '@/store/dogStore';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { ClassSelectionData } from '@/types/show-registration-types';
import { Dog } from '@/types/dog-types';
import { cn } from '@/lib/utils';
import { useExistingEntries } from '@/hooks/useExistingEntries';
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
    description?: string;
    fee?: number;
    entryFee?: number;
    className?: string;
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
  
  const [classesWithTrials, setClassesWithTrials] = useState<ClassWithTrial[]>([]);
  const [activeTab, setActiveTab] = useState(selectedDogs[0] || '');
  
  
  // Check for existing entries
  const { getExistingEntry, getEntriesForDog } = useExistingEntries(showId);

  const show = shows.find(s => s.id === showId);
  const showTrials = (trials || []).filter(t => t.showId === showId);

  useEffect(() => {
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
    
    setClassesWithTrials(grouped);
  }, [showTrials, classes, show?.startDate]); // Fixed dependencies to prevent infinite loop

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

  const handleClassToggle = (dogId: string, trialId: string, classId: string) => {
    const currentSelection = getSelectionForDog(dogId);
    const classIndex = currentSelection.selectedClasses.findIndex(c => c.classId === classId);
    
    let updatedSelection: ClassSelectionData;
    
    if (classIndex >= 0) {
      // Remove class
      updatedSelection = {
        ...currentSelection,
        selectedClasses: currentSelection.selectedClasses.filter(c => c.classId !== classId)
      };
    } else {
      // Add class
      updatedSelection = {
        ...currentSelection,
        trialId,
        selectedClasses: [...currentSelection.selectedClasses, {
          classId,
          jumpHeight: undefined,
          moveUpRequested: false
        }]
      };
    }
    
    const newSelections = classSelections.filter(s => s.dogId !== dogId);
    if (updatedSelection.selectedClasses.length > 0) {
      newSelections.push(updatedSelection);
    }
    
    onSelectionChange(newSelections);
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
    const selection = getSelectionForDog(dogId);
    return selection.selectedClasses.some(c => c.classId === classId);
  };

  const getClassFee = (classData: ClassWithTrial['classData']): number => {
    // Mock fee calculation
    return classData.entryFee || 25;
  };

  const getTotalFeesForDog = (dogId: string): number => {
    const selection = getSelectionForDog(dogId);
    return selection.selectedClasses.reduce((total, selectedClass) => {
      const classData = classesWithTrials.find(c => c.classData.id === selectedClass.classId)?.classData;
      return total + (classData ? getClassFee(classData) : 0);
    }, 0);
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
            const selection = getSelectionForDog(dogId);
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
                  {selection.selectedClasses.length > 0 && (
                    <Badge 
                      variant={isActive ? "default" : "secondary"} 
                      className="h-5 px-1.5 text-xs"
                      style={isActive ? { backgroundColor: '#007AFF' } : {}}
                    >
                      +{selection.selectedClasses.length}
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
                                
                                return (
                                  <div key={`${dogId}-${classData.id}`} className="space-y-2">
                                    <div className={cn(
                                      "apple-class-card apple-class-card-compact",
                                      (isSelected || isAlreadyEntered) && "selected",
                                      isAlreadyEntered && "bg-green-50 border-green-300"
                                    )}>
                                      <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center space-x-3 flex-1">
                                          <Checkbox
                                            id={`${dogId}-${classData.id}`}
                                            checked={isSelected || isAlreadyEntered}
                                            disabled={isAlreadyEntered}
                                            onCheckedChange={() => !isAlreadyEntered && handleClassToggle(dogId, trial.id, classData.id)}
                                          />
                                          <Label
                                            htmlFor={`${dogId}-${classData.id}`}
                                            className={cn(
                                              "cursor-pointer flex-1",
                                              isAlreadyEntered && "cursor-not-allowed"
                                            )}
                                          >
                                            <div className="flex items-center justify-between w-full">
                                              <div className="flex items-center gap-2">
                                                <span className={cn(
                                                  "apple-class-card-title-compact",
                                                  isAlreadyEntered && "text-green-700"
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
                                              </div>
                                              <div className={cn(
                                                "apple-class-card-price-compact",
                                                isAlreadyEntered && "bg-green-100 text-green-700"
                                              )}>
                                                ${getClassFee(classData)}
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
                  
                  {selection.selectedClasses.length > 0 && (
                    <div className="mt-4 p-3 bg-primary/10 rounded-lg flex justify-between items-center">
                      <span className="text-sm font-medium">
                        {selection.selectedClasses.length} class{selection.selectedClasses.length > 1 ? 'es' : ''} selected
                      </span>
                      <span className="text-sm font-semibold">
                        Total: ${getTotalFeesForDog(dogId)}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>

      <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex justify-between items-center">
          <span className="font-medium">Total Fees (all dogs):</span>
          <span className="text-lg font-semibold">
            ${selectedDogs.reduce((total, dogId) => total + getTotalFeesForDog(dogId), 0)}
          </span>
        </div>
      </div>
    </div>
  );
};