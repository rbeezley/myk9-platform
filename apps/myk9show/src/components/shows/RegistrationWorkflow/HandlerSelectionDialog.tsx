import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HandlerInfo } from '@/types/show-registration-types';
import { getDogDisplayName, type Dog } from '@/types/dog-types';
import { useUserStore } from '@/store/userStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { shouldLoadPeopleDirectory } from '@/services/database/users/peopleDirectoryAccess';
import { filterPeopleByName, getPersonName } from '@/lib/people-utils';
import type { User } from '@/types/user-types';

interface HandlerSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDogs: string[];
  dogs: Dog[];
  onHandlerAssignment: (assignments: Record<string, HandlerInfo>) => void;
  initialAssignments?: Record<string, HandlerInfo>;
}

export const HandlerSelectionDialog: React.FC<HandlerSelectionDialogProps> = ({
  open,
  onOpenChange,
  selectedDogs,
  dogs,
  onHandlerAssignment,
  initialAssignments = {},
}) => {
  const people = useUserStore(s => s.people);
  const loadPeople = useUserStore(s => s.loadPeople);
  const peopleLoading = useUserStore(s => s.isLoading);

  // SA-008: the people directory (getAllUsers) may only be loaded for management
  // sessions. An exhibitor self-registering gets freeform handler entry (default
  // = the dog's owner) without the directory typeahead — never the bulk fetch.
  const { userWithRoles } = useAuthContext();
  const canLoadDirectory = shouldLoadPeopleDirectory(userWithRoles?.roles);

  const hasFetchedPeople = useRef(false);

  // Load people once (management only) if not already loaded. Depends on
  // canLoadDirectory so it fires if roles resolve after mount (RBAC is async).
  useEffect(() => {
    if (!canLoadDirectory) return;
    if (people.length === 0 && !hasFetchedPeople.current) {
      hasFetchedPeople.current = true;
      loadPeople();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLoadDirectory]);

  // Build initial handler name from existing assignment or owner
  const getInitialName = (dogId: string): string => {
    const existing = initialAssignments[dogId];
    if (existing?.handlerName) return existing.handlerName;
    const dog = dogs.find(d => d.id === dogId);
    return dog?.ownerName || '';
  };

  const getInitialPersonId = (dogId: string): string => {
    const existing = initialAssignments[dogId];
    if (existing?.handlerId) return existing.handlerId;
    const dog = dogs.find(d => d.id === dogId);
    return dog?.ownerId || '';
  };

  const [handlerNames, setHandlerNames] = useState<Record<string, string>>(() => {
    const names: Record<string, string> = {};
    selectedDogs.forEach(dogId => {
      names[dogId] = getInitialName(dogId);
    });
    return names;
  });
  const [selectedPersonIds, setSelectedPersonIds] = useState<Record<string, string>>(() => {
    const ids: Record<string, string> = {};
    selectedDogs.forEach(dogId => {
      ids[dogId] = getInitialPersonId(dogId);
    });
    return ids;
  });
  const [focusedDogId, setFocusedDogId] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  const handleSubmit = () => {
    // Validate: all dogs must have a handler name
    const allFilled = selectedDogs.every(dogId => handlerNames[dogId]?.trim());
    if (!allFilled) {
      setHasError(true);
      return;
    }

    const assignments: Record<string, HandlerInfo> = {};
    selectedDogs.forEach(dogId => {
      const dog = dogs.find(d => d.id === dogId);
      const name = handlerNames[dogId].trim();
      const personId = selectedPersonIds[dogId] || '';
      const isOwner =
        (!!dog?.ownerId && personId === dog.ownerId) ||
        (!!dog?.ownerName && name.toLowerCase() === dog.ownerName.trim().toLowerCase());

      assignments[dogId] = {
        handlerId: personId,
        handlerName: name,
        isOwner,
      };
    });

    onHandlerAssignment(assignments);
    onOpenChange(false);
  };

  const resetToOwner = (dogId: string) => {
    const dog = dogs.find(d => d.id === dogId);
    if (dog?.ownerName) {
      setHandlerNames(prev => ({ ...prev, [dogId]: dog.ownerName || '' }));
      setSelectedPersonIds(prev => ({ ...prev, [dogId]: dog.ownerId || '' }));
      setHasError(false);
    }
  };

  const handleSelectPerson = (dogId: string, personId: string, personName: string) => {
    setHandlerNames(prev => ({ ...prev, [dogId]: personName }));
    setSelectedPersonIds(prev => ({ ...prev, [dogId]: personId }));
    setFocusedDogId(null);
    setHasError(false);
  };

  const handleInputChange = (dogId: string, value: string) => {
    setHandlerNames(prev => ({ ...prev, [dogId]: value }));
    // Clear person ID when user edits text (they may be typing a different name)
    setSelectedPersonIds(prev => ({ ...prev, [dogId]: '' }));
    setHasError(false);
    setFocusedDogId(dogId);
  };

  const handleOpenChange = useCallback((dogId: string, isOpen: boolean) => {
    setFocusedDogId(isOpen ? dogId : null);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg flex flex-col max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Change Handler</DialogTitle>
          <DialogDescription>
            Search for an existing person or type a handler name.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {selectedDogs.map(dogId => {
            const dog = dogs.find(d => d.id === dogId);
            if (!dog) return null;

            const currentName = handlerNames[dogId] || '';
            const isOpen = focusedDogId === dogId && currentName.trim().length >= 2;

            return (
              <HandlerDogCard
                key={dogId}
                dog={dog}
                currentName={currentName}
                hasError={hasError}
                isOpen={isOpen}
                onOpenChange={handleOpenChange}
                // SA-008: never surface the directory to a gated (exhibitor)
                // session even if a prior management session left it in the
                // persisted store — mask the list, not just the fetch.
                people={canLoadDirectory ? people : []}
                peopleLoading={canLoadDirectory ? peopleLoading : false}
                onInputChange={handleInputChange}
                onSelectPerson={handleSelectPerson}
                onResetToOwner={resetToOwner}
              />
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

// Per-dog card with combobox dropdown
interface HandlerDogCardProps {
  dog: Dog;
  currentName: string;
  hasError: boolean;
  isOpen: boolean;
  onOpenChange: (dogId: string, isOpen: boolean) => void;
  people: User[];
  peopleLoading: boolean;
  onInputChange: (dogId: string, value: string) => void;
  onSelectPerson: (dogId: string, personId: string, personName: string) => void;
  onResetToOwner: (dogId: string) => void;
}

const HandlerDogCard: React.FC<HandlerDogCardProps> = ({
  dog,
  currentName,
  hasError,
  isOpen,
  onOpenChange,
  people,
  peopleLoading,
  onInputChange,
  onSelectPerson,
  onResetToOwner,
}) => {
  const dogId = dog.id;
  const ownerName = dog.ownerName;
  const isModified = !!ownerName && currentName !== ownerName;
  const isEmpty = !currentName.trim();

  const filteredPeople = useMemo(() => {
    if (currentName.trim().length < 2) return [];
    return filterPeopleByName(people, currentName).slice(0, 10);
  }, [people, currentName]);

  return (
    <Card className={hasError && isEmpty ? 'border-destructive' : ''}>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold">{getDogDisplayName(dog)}</h4>
            <p className="text-sm text-muted-foreground">{dog.breed}</p>
          </div>
          {ownerName && (
            <Badge variant="secondary" className="text-xs">
              Owner: {ownerName}
            </Badge>
          )}
        </div>

        <FormField
          label="Handler name"
          fieldId={`handler-${dogId}`}
          error={hasError && isEmpty ? 'Please enter a handler name' : undefined}
        >
          <Popover open={isOpen} onOpenChange={open => onOpenChange(dogId, open)}>
            <div className="flex gap-2">
              <PopoverTrigger asChild>
                <Input
                  id={`handler-${dogId}`}
                  value={currentName}
                  onChange={e => onInputChange(dogId, e.target.value)}
                  onFocus={() => onOpenChange(dogId, true)}
                  onClick={() => onOpenChange(dogId, true)}
                  placeholder="Search for a person or type a name"
                  role="combobox"
                  aria-invalid={hasError && isEmpty}
                  aria-describedby={hasError && isEmpty ? `handler-${dogId}-error` : undefined}
                  aria-expanded={isOpen}
                  aria-controls={`handler-${dogId}-suggestions`}
                  aria-autocomplete="list"
                  autoComplete="off"
                />
              </PopoverTrigger>
              {isModified && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onResetToOwner(dogId)}
                  title="Reset to owner"
                  aria-label="Reset to owner"
                  className="shrink-0"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
            </div>

            {isOpen && (
              <PopoverContent
                id={`handler-${dogId}-suggestions`}
                align="start"
                initialFocus={false}
                className="w-[var(--anchor-width)] max-h-[min(12rem,var(--available-height))] overflow-auto p-0"
                role="listbox"
              >
                {filteredPeople.length > 0 ? (
                  filteredPeople.map(person => {
                    const fullName = getPersonName(people, person.id) ?? '';
                    return (
                      <button
                        key={person.id}
                        type="button"
                        role="option"
                        aria-selected={false}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                        onMouseDown={e => {
                          e.preventDefault(); // Prevent input blur before click registers
                          onSelectPerson(dogId, person.id, fullName);
                        }}
                      >
                        <div className="font-medium">{fullName}</div>
                        {person.email && (
                          <div className="text-xs text-muted-foreground">{person.email}</div>
                        )}
                      </button>
                    );
                  })
                ) : peopleLoading ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Loading...</div>
                ) : (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No matches — press Confirm Handler to use this name
                  </div>
                )}
              </PopoverContent>
            )}
          </Popover>
        </FormField>
      </CardContent>
    </Card>
  );
};
