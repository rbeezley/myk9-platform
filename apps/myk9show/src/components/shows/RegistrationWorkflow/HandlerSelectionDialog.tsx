import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useShowQuery } from '@/hooks/queries/useShowsDatabase';
import { HandlerInfo } from '@/types/show-registration-types';
import { useDebounce } from '@myk9/scoring-ui';
import { checkHandlerConflicts as checkConflictsLib } from '@/lib/handlerValidation';
import type { Show } from '@/types/show-types';

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
  conflictInfo?:
    | {
        hasConflict: boolean;
        conflictingClasses?: string[] | undefined;
        message?: string | undefined;
      }
    | undefined;
}

export const HandlerSelectionDialog: React.FC<HandlerSelectionDialogProps> = ({
  open,
  onOpenChange,
  selectedDogs,
  showId,
  onHandlerAssignment,
  initialAssignments = {},
}) => {
  const { dogs } = useDogStoreCompat();
  const showQuery = useShowQuery(showId);
  const show = showQuery.data as Show | undefined;

  const [searchQuery, setSearchQuery] = useState('');
  const [handlerAssignments, setHandlerAssignments] =
    useState<Record<string, HandlerInfo>>(initialAssignments);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Get dogs with their owners (derived from dog data, not from separate people store)
  const dogsWithOwners = useMemo(() => {
    return selectedDogs
      .map(dogId => {
        const dog = dogs.find(d => d.id === dogId);
        if (!dog) return null;

        return {
          dog,
          ownerName: dog.ownerName || 'Unknown Owner',
          ownerId: dog.ownerId,
        };
      })
      .filter(Boolean) as { dog: (typeof dogs)[number]; ownerName: string; ownerId: string }[];
  }, [selectedDogs, dogs]);

  // Conflict checker depends on current handler assignments
  const checkHandlerConflicts = useCallback(
    (handlerId: string, targetShowId: string): HandlerOption['conflictInfo'] => {
      const conflicts = checkConflictsLib(handlerId, targetShowId, '', [], handlerAssignments);
      if (conflicts.length === 0) {
        return { hasConflict: false };
      }
      const errorConflicts = conflicts.filter(c => c.severity === 'error');
      const descriptions = conflicts.map(c => c.description);
      return {
        hasConflict: errorConflicts.length > 0,
        conflictingClasses: conflicts.flatMap(c => c.affectedClassIds || []),
        message: descriptions.join('; '),
      };
    },
    [handlerAssignments]
  );

  // Build handler options from dog owner data
  const availableHandlers = useMemo((): HandlerOption[] => {
    const handlers: HandlerOption[] = [];

    // Add unique dog owners as handler options
    dogsWithOwners.forEach(({ ownerId, ownerName }) => {
      if (ownerId && !handlers.find(h => h.id === ownerId)) {
        const conflictInfo = show ? checkHandlerConflicts(ownerId, show.id) : undefined;
        handlers.push({
          id: ownerId,
          name: ownerName,
          isOwner: true,
          isProfessionalHandler: false,
          conflictInfo,
        });
      }
    });

    // Filter by search query
    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      return handlers.filter(
        h =>
          h.name.toLowerCase().includes(query) || (h.email && h.email.toLowerCase().includes(query))
      );
    }

    return handlers;
  }, [dogsWithOwners, show, debouncedSearchQuery, checkHandlerConflicts]);

  // Initialize default handlers (dog owners)
  useEffect(() => {
    if (Object.keys(initialAssignments).length === 0) {
      const defaultAssignments: Record<string, HandlerInfo> = {};

      dogsWithOwners.forEach(({ dog, ownerId, ownerName }) => {
        if (ownerId) {
          defaultAssignments[dog.id] = {
            handlerId: ownerId,
            handlerName: ownerName,
            isOwner: true,
          };
        }
      });

      setHandlerAssignments(defaultAssignments);
    }
  }, [dogsWithOwners, initialAssignments]);

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
          isOwner: handler.isOwner,
        },
      }));

      // Clear validation error for this dog
      setValidationErrors(prev => {
        const { [dogId]: _removed, ...rest } = prev;
        return rest;
      });
    }
  };

  const handleSubmit = () => {
    if (validateAssignments()) {
      onHandlerAssignment(handlerAssignments);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg flex flex-col max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Change Handler</DialogTitle>
          <DialogDescription>
            Select a handler for this dog. The owner is assigned by default.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Search Bar (show only if there are multiple handler options) */}
          {availableHandlers.length > 3 && (
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search handlers..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          )}

          {/* Handler Selection */}
          {selectedDogs.map(dogId => {
            const dogData = dogsWithOwners.find(({ dog }) => dog.id === dogId);
            if (!dogData) return null;

            const { dog } = dogData;
            const currentHandler = handlerAssignments[dogId];
            const error = validationErrors[dogId];

            return (
              <Card key={dogId} className={error ? 'border-destructive' : ''}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">{dog.callName || dog.name}</h4>
                      <p className="text-sm text-muted-foreground">{dog.breed}</p>
                    </div>
                    {currentHandler && (
                      <Badge variant={currentHandler.isOwner ? 'secondary' : 'outline'}>
                        {currentHandler.isOwner ? 'Owner' : 'Handler'}
                      </Badge>
                    )}
                  </div>

                  <div>
                    <Label>Handler</Label>
                    <RadioGroup
                      value={currentHandler?.handlerId || ''}
                      onValueChange={handlerId => handleIndividualAssignment(dogId, handlerId)}
                    >
                      {availableHandlers.map(handler => (
                        <div key={handler.id} className="flex items-center space-x-2 p-2">
                          <RadioGroupItem value={handler.id} id={`${dogId}-${handler.id}`} />
                          <Label
                            htmlFor={`${dogId}-${handler.id}`}
                            className="flex-1 cursor-pointer flex items-center justify-between"
                          >
                            <span className="font-medium">{handler.name}</span>
                            <div className="flex items-center gap-2">
                              {handler.isOwner && (
                                <Badge variant="secondary" className="text-xs">
                                  Owner
                                </Badge>
                              )}
                              {handler.conflictInfo?.hasConflict && (
                                <Badge variant="destructive" className="text-xs">
                                  Conflict
                                </Badge>
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
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Separator />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Confirm Handler</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
