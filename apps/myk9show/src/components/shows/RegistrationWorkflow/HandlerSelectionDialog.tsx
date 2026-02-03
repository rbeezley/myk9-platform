import React, { useState, useMemo, useEffect } from 'react';
import { Search, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUserStore } from '@/store/userStore';
import { useDogStore } from '@/store/dogStore';
import { useShowStore } from '@/store/showStore';
import { useRegistrationPermissions } from '@/hooks/useRegistrationPermissions';
import { Dog, User } from '@/types/dog-types';
import { HandlerInfo } from '@/types/show-registration-types';
import { useDebounce } from '@myk9/scoring-ui';
import { logger } from '@/services/LoggingService';

interface HandlerSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDogs: string[];
  showId: string;
  onHandlerAssignment: (assignments: Record<string, HandlerInfo>) => void;
  initialAssignments?: Record<string, HandlerInfo>;
}

interface HandlerOption {
  id: string;
  name: string;
  email?: string | undefined;
  isOwner: boolean;
  isProfessionalHandler: boolean;
  conflictInfo?: {
    hasConflict: boolean;
    conflictingClasses?: string[] | undefined;
    message?: string | undefined;
  } | undefined;
}

export const HandlerSelectionDialog: React.FC<HandlerSelectionDialogProps> = ({
  open,
  onOpenChange,
  selectedDogs,
  showId,
  onHandlerAssignment,
  initialAssignments = {}
}) => {
  const { people = [] } = useUserStore();
  const { dogs = [] } = useDogStore();
  const { shows = [] } = useShowStore();
  const { canAssignHandlers, isSecretary, isClubAdmin, isSiteAdmin } = useRegistrationPermissions();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [handlerAssignments, setHandlerAssignments] = useState<Record<string, HandlerInfo>>(initialAssignments);
  const [assignmentMode, setAssignmentMode] = useState<'individual' | 'bulk'>('individual');
  const [bulkHandlerId, setBulkHandlerId] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const show = shows.find(s => s.id === showId);
  
  // Get dogs with their owners
  const dogsWithOwners = useMemo(() => {
    return selectedDogs.map(dogId => {
      const dog = dogs.find(d => d.id === dogId);
      if (!dog) return null;
      
      const owner = people.find(p => p.id === dog.ownerId);
      return { dog, owner };
    }).filter(Boolean) as { dog: Dog; owner: User | undefined }[];
  }, [selectedDogs, dogs, people]);
  
  // Get available handlers with validation
  const availableHandlers = useMemo((): HandlerOption[] => {
    if (!show) return [];
    
    const handlers: HandlerOption[] = [];
    
    // Add dog owners as handler options
    dogsWithOwners.forEach(({ owner }) => {
      if (owner && !handlers.find(h => h.id === owner.id)) {
        handlers.push({
          id: owner.id,
          name: `${owner.firstName} ${owner.lastName}`,
          email: owner.email,
          isOwner: true,
          isProfessionalHandler: false
        });
      }
    });
    
    // Add professional handlers if user has permission
    if (canAssignHandlers || isSecretary || isClubAdmin || isSiteAdmin) {
      people.forEach(person => {
        // Skip if already added as owner
        if (handlers.find(h => h.id === person.id)) return;
        
        // Check if person has handler permissions for this show
        const canHandleAtShow = checkHandlerPermissions(person, show);
        if (!canHandleAtShow) return;
        
        // Check for conflicts
        const conflictInfo = checkHandlerConflicts(person.id, show.id);
        
        handlers.push({
          id: person.id,
          name: `${person.firstName} ${person.lastName}`,
          email: person.email,
          isOwner: false,
          isProfessionalHandler: true,
          conflictInfo
        });
      });
    }
    
    // Filter by search query
    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      return handlers.filter(h => 
        h.name.toLowerCase().includes(query) ||
        (h.email && h.email.toLowerCase().includes(query))
      );
    }
    
    return handlers;
  }, [dogsWithOwners, people, show, canAssignHandlers, isSecretary, isClubAdmin, isSiteAdmin, debouncedSearchQuery]);
  
  // Initialize default handlers (dog owners)
  useEffect(() => {
    if (Object.keys(initialAssignments).length === 0) {
      const defaultAssignments: Record<string, HandlerInfo> = {};
      
      dogsWithOwners.forEach(({ dog, owner }) => {
        if (owner) {
          defaultAssignments[dog.id] = {
            handlerId: owner.id,
            handlerName: `${owner.firstName} ${owner.lastName}`,
            isOwner: true
          };
        }
      });
      
      setHandlerAssignments(defaultAssignments);
    }
  }, [dogsWithOwners, initialAssignments]);
  
  const checkHandlerPermissions = (person: User, show: unknown): boolean => {
    // TODO: Implement actual permission checking based on show rules
    // For now, return true for all registered users
    logger.debug('Checking permissions for:', 'shows', { personName: person.name, show });
    return true;
  };
  
  const checkHandlerConflicts = (handlerId: string, showId: string): HandlerOption['conflictInfo'] => {
    // TODO: Implement actual conflict checking
    // Check if handler is already handling dogs in conflicting time slots
    logger.debug('Checking conflicts for handler:', 'shows', { handlerId, showId });
    return {
      hasConflict: false
    };
  };
  
  const validateAssignments = (): boolean => {
    const errors: Record<string, string> = {};
    let isValid = true;
    
    selectedDogs.forEach(dogId => {
      const assignment = handlerAssignments[dogId];
      if (!assignment || !assignment.handlerId) {
        errors[dogId] = 'Handler is required';
        isValid = false;
      } else {
        const handler = availableHandlers.find(h => h.id === assignment.handlerId);
        if (handler?.conflictInfo?.hasConflict) {
          errors[dogId] = handler.conflictInfo.message || 'Handler has conflicts';
          isValid = false;
        }
      }
    });
    
    setValidationErrors(errors);
    return isValid;
  };
  
  const handleIndividualAssignment = (dogId: string, handlerId: string) => {
    const handler = availableHandlers.find(h => h.id === handlerId);
    if (handler) {
      setHandlerAssignments(prev => ({
        ...prev,
        [dogId]: {
          handlerId: handler.id,
          handlerName: handler.name,
          isOwner: handler.isOwner
        }
      }));
      
      // Clear validation error for this dog
      setValidationErrors(prev => {
        const { [dogId]: removed, ...rest } = prev;
        logger.debug('Removed validation error for dog:', 'shows', { dogId, removedError: removed });
        return rest;
      });
    }
  };
  
  const handleBulkAssignment = () => {
    if (!bulkHandlerId) return;
    
    const handler = availableHandlers.find(h => h.id === bulkHandlerId);
    if (handler) {
      const newAssignments: Record<string, HandlerInfo> = {};
      
      selectedDogs.forEach(dogId => {
        newAssignments[dogId] = {
          handlerId: handler.id,
          handlerName: handler.name,
          isOwner: handler.isOwner
        };
      });
      
      setHandlerAssignments(newAssignments);
      setValidationErrors({});
    }
  };
  
  const handleSubmit = () => {
    if (validateAssignments()) {
      onHandlerAssignment(handlerAssignments);
      onOpenChange(false);
    }
  };
  
  const getDogInfo = (dogId: string) => {
    const dogWithOwner = dogsWithOwners.find(({ dog }) => dog.id === dogId);
    return dogWithOwner;
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Assign Handlers</DialogTitle>
          <DialogDescription>
            Assign handlers to the selected dogs. By default, the dog's owner will be the handler.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Mode Selection */}
          {selectedDogs.length > 1 && (isSecretary || isClubAdmin || isSiteAdmin) && (
            <div className="space-y-2">
              <Label>Assignment Mode</Label>
              <RadioGroup value={assignmentMode} onValueChange={(v) => setAssignmentMode(v as 'individual' | 'bulk')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="individual" id="individual" />
                  <Label htmlFor="individual" className="cursor-pointer">
                    Individual Assignment
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="bulk" id="bulk" />
                  <Label htmlFor="bulk" className="cursor-pointer">
                    Bulk Assignment (Same handler for all dogs)
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}
          
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search handlers by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          
          {/* Bulk Assignment */}
          {assignmentMode === 'bulk' && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="bulk-handler">Select Handler for All Dogs</Label>
                    <RadioGroup value={bulkHandlerId} onValueChange={setBulkHandlerId}>
                      <ScrollArea className="h-48">
                        {availableHandlers.map((handler) => (
                          <div key={handler.id} className="flex items-center space-x-2 p-2">
                            <RadioGroupItem value={handler.id} id={`bulk-${handler.id}`} />
                            <Label 
                              htmlFor={`bulk-${handler.id}`} 
                              className="flex-1 cursor-pointer flex items-center justify-between"
                            >
                              <div>
                                <div className="font-medium">{handler.name}</div>
                                <div className="text-sm text-muted-foreground">{handler.email}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                {handler.isOwner && (
                                  <Badge variant="secondary">Owner</Badge>
                                )}
                                {handler.isProfessionalHandler && (
                                  <Badge variant="outline">Professional</Badge>
                                )}
                                {handler.conflictInfo?.hasConflict && (
                                  <Badge variant="destructive">Conflict</Badge>
                                )}
                              </div>
                            </Label>
                          </div>
                        ))}
                      </ScrollArea>
                    </RadioGroup>
                  </div>
                  <Button 
                    onClick={handleBulkAssignment} 
                    disabled={!bulkHandlerId}
                    className="w-full"
                  >
                    Apply to All Dogs
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Individual Assignment */}
          {assignmentMode === 'individual' && (
            <ScrollArea className="h-96">
              <div className="space-y-4">
                {selectedDogs.map((dogId) => {
                  const dogInfo = getDogInfo(dogId);
                  if (!dogInfo) return null;
                  
                  const { dog, owner } = dogInfo;
                  const currentHandler = handlerAssignments[dogId];
                  const error = validationErrors[dogId];
                  
                  return (
                    <Card key={dogId} className={error ? 'border-destructive' : ''}>
                      <CardContent className="pt-6">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-semibold">{dog.callName}</h4>
                              <p className="text-sm text-muted-foreground">
                                {dog.registrations?.[0]?.breed || 'No breed specified'} • {owner ? `${owner.firstName} ${owner.lastName}` : 'Unknown Owner'}
                              </p>
                            </div>
                            {currentHandler && (
                              <Badge variant={currentHandler.isOwner ? 'secondary' : 'outline'}>
                                {currentHandler.isOwner ? 'Owner Handling' : 'Professional Handler'}
                              </Badge>
                            )}
                          </div>
                          
                          <div>
                            <Label>Handler</Label>
                            <RadioGroup 
                              value={currentHandler?.handlerId || ''} 
                              onValueChange={(handlerId) => handleIndividualAssignment(dogId, handlerId)}
                            >
                              {availableHandlers.map((handler) => (
                                <div key={handler.id} className="flex items-center space-x-2 p-2">
                                  <RadioGroupItem value={handler.id} id={`${dogId}-${handler.id}`} />
                                  <Label 
                                    htmlFor={`${dogId}-${handler.id}`} 
                                    className="flex-1 cursor-pointer flex items-center justify-between"
                                  >
                                    <div>
                                      <div className="font-medium">{handler.name}</div>
                                      <div className="text-sm text-muted-foreground">{handler.email}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {handler.isOwner && dog.ownerId === handler.id && (
                                        <Badge variant="secondary">Owner</Badge>
                                      )}
                                      {handler.isProfessionalHandler && (
                                        <Badge variant="outline">Professional</Badge>
                                      )}
                                      {handler.conflictInfo?.hasConflict && (
                                        <Badge variant="destructive">Conflict</Badge>
                                      )}
                                    </div>
                                  </Label>
                                </div>
                              ))}
                            </RadioGroup>
                          </div>
                          
                          {error && (
                            <Alert variant="destructive">
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription>{error}</AlertDescription>
                            </Alert>
                          )}
                          
                          {currentHandler && availableHandlers.find(h => h.id === currentHandler.handlerId)?.conflictInfo?.hasConflict && (
                            <Alert>
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription>
                                {availableHandlers.find(h => h.id === currentHandler.handlerId)?.conflictInfo?.message}
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
          
          {/* Summary */}
          <div className="bg-muted p-4 rounded-lg">
            <h4 className="font-medium mb-2">Handler Summary</h4>
            <div className="space-y-1 text-sm">
              {Object.entries(
                Object.entries(handlerAssignments).reduce((acc, [dogId, handler]) => {
                  if (!handler.handlerId) return acc;
                  if (!acc[handler.handlerId]) {
                    acc[handler.handlerId] = {
                      name: handler.handlerName,
                      dogs: []
                    };
                  }
                  const dog = dogs.find(d => d.id === dogId);
                  if (dog && dog.callName) {
                    acc[handler.handlerId].dogs.push(dog.callName);
                  }
                  return acc;
                }, {} as Record<string, { name: string; dogs: string[] }>)
              ).map(([handlerId, { name, dogs }]) => (
                <div key={handlerId} className="flex items-center justify-between">
                  <span className="font-medium">{name}</span>
                  <span className="text-muted-foreground">{dogs.join(', ')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <Separator />
        
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            Confirm Handlers
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};