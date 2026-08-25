import React from 'react';
import { Check, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { getAgeInMonths } from '@/hooks/useEntryEligibility';
import { getDogDisplayName, getDogBreedLabel, getDogRegisteredName, Dog } from '@/types/dog-types';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/common/SkeletonLoaders';
import { Button } from '@/components/ui/button';
import { AddEditRegistrationDialog } from '@/components/dogs/AddEditRegistrationDialog';
import type { Registration } from '@/types/dog-types';
import { toast } from 'sonner';
import '@/styles/myk9-registration-workflow.css';

interface DogSelectionStepProps {
  selectedDogs: string[];
  onSelectionChange: (dogIds: string[]) => void;
}

export const DogSelectionStep: React.FC<DogSelectionStepProps> = ({
  selectedDogs,
  onSelectionChange,
}) => {
  const { dogs, isLoading, updateDog, refetch } = useDogStoreCompat();
  const [registrationDogId, setRegistrationDogId] = React.useState<string | null>(null);

  // Compute eligible dogs directly from dogs (derived state, no useEffect needed)
  const eligibleDogs = React.useMemo(() => {
    return dogs.filter(dog => {
      // Check if dog is not deleted
      if (dog.deletedAt) return false;

      // Exclude non-active dogs (retired/deceased)
      if (dog.status && dog.status !== 'active') return false;

      // Check if dog has required vaccinations (mock check)
      // In real app, would validate against show requirements
      return true;
    });
  }, [dogs]);

  const handleDogToggle = (dogId: string) => {
    if (selectedDogs.includes(dogId)) {
      onSelectionChange(selectedDogs.filter(id => id !== dogId));
    } else {
      onSelectionChange([...selectedDogs, dogId]);
    }
  };

  const handleSaveRegistration = async (registration: Registration) => {
    const dogId = registrationDogId;
    if (!dogId || !updateDog) return;
    const dog = dogs.find(candidate => candidate.id === dogId);
    if (!dog) return;

    const registrations = [
      ...(dog.registrations ?? []).map(existing => ({
        organization: existing.organization,
        number: existing.registrationNumber,
        registeredName: existing.registeredName,
        type: existing.breed,
        status: existing.status,
      })),
      {
        organization: registration.organization,
        number: registration.registrationNumber,
        registeredName: registration.registeredName,
        type: registration.breed,
        status: registration.status,
      },
    ];

    await updateDog(dogId, { registrations });
    refetch?.();
    toast.success('Registration added');
    setRegistrationDogId(null);
  };

  const getDogEligibilityStatus = (dog: Dog) => {
    const issues: string[] = [];
    const warnings: string[] = [];

    if (dog.dateOfBirth && getAgeInMonths(dog.dateOfBirth) < 6) {
      issues.push('Too young (must be 6+ months)');
    }

    // Registration is a warning only — registrations may not be loaded in all data paths
    // and lack of a registration does not prevent selecting a dog for entry.
    // Class-level eligibility (including registration requirements) is validated later.
    if (dog.registrations && dog.registrations.length === 0) {
      warnings.push('No registration on file — verify before submitting');
    }

    return {
      eligible: issues.length === 0,
      issues,
      warnings,
    };
  };

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading your dogs" className="space-y-4 py-2">
        <div className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (eligibleDogs.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No eligible dogs found.</p>
        <p className="text-sm text-muted-foreground/80 mt-2">
          Make sure your dogs are active and have up-to-date information.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Select Dogs to Register</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Choose which dogs you want to enter in this show. You can select multiple dogs.
        </p>
      </div>

      <ScrollArea className="h-auto pr-0 md:h-[400px] md:pr-4">
        <div className="space-y-3">
          {eligibleDogs.map(dog => {
            const { eligible, issues, warnings } = getDogEligibilityStatus(dog);
            const isSelected = selectedDogs.includes(dog.id);

            return (
              <Card
                key={dog.id}
                className={cn(
                  'myk9-dog-card cursor-pointer',
                  isSelected && 'selected',
                  !eligible && 'opacity-60'
                )}
                onClick={() => eligible && handleDogToggle(dog.id)}
              >
                <CardContent className="p-0">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      checked={isSelected}
                      disabled={!eligible}
                      onCheckedChange={() => handleDogToggle(dog.id)}
                      onClick={e => e.stopPropagation()}
                      className="mt-1"
                    />

                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-base font-medium cursor-pointer">
                            {getDogDisplayName(dog)}
                            {getDogRegisteredName(dog) && ` "${getDogRegisteredName(dog)}"`}
                          </Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            {getDogBreedLabel(dog)} • {dog.gender || 'Unknown'} • Born{' '}
                            {formatDateMMDDYYYY(dog.dateOfBirth)}
                          </p>
                        </div>

                        {isSelected && (
                          <Badge variant="default" className="ml-2">
                            <Check className="w-3 h-3 mr-1" />
                            Selected
                          </Badge>
                        )}
                      </div>

                      {dog.registrations && dog.registrations.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {dog.registrations.map((reg, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {reg.organization}: {reg.registrationNumber}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {!eligible && issues.length > 0 && (
                        <div className="mt-2">
                          {issues.map((issue, idx) => (
                            <p key={idx} className="text-xs text-destructive">
                              • {issue}
                            </p>
                          ))}
                        </div>
                      )}

                      {eligible && warnings.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {warnings.map((warning, idx) => (
                            <p key={idx} className="text-xs text-warning ">
                              • {warning}
                            </p>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={event => {
                              event.stopPropagation();
                              setRegistrationDogId(dog.id);
                            }}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Add registration
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      {selectedDogs.length > 0 && (
        <div className="mt-4 p-3 bg-primary/10 rounded-lg">
          <p className="text-sm font-medium">
            {selectedDogs.length} dog{selectedDogs.length > 1 ? 's' : ''} selected
          </p>
        </div>
      )}

      <div className="relative z-[60]">
        <AddEditRegistrationDialog
          open={registrationDogId !== null}
          onOpenChange={open => !open && setRegistrationDogId(null)}
          onSave={registration => void handleSaveRegistration(registration)}
        />
      </div>
    </div>
  );
};
