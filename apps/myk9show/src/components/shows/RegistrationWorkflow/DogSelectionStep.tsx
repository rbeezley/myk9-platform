import React from 'react';
import { Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { Dog } from '@/types/dog-types';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import { cn } from '@/lib/utils';
import '@/styles/apple-registration-workflow.css';

interface DogSelectionStepProps {
  selectedDogs: string[];
  onSelectionChange: (dogIds: string[]) => void;
}

export const DogSelectionStep: React.FC<DogSelectionStepProps> = ({
  selectedDogs,
  onSelectionChange,
}) => {
  const { dogs, isLoading } = useDogStoreCompat();

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

  const getDogEligibilityStatus = (dog: Dog) => {
    // Mock eligibility checks
    const issues: string[] = [];

    // Check age (example: must be at least 6 months old)
    if (dog.dateOfBirth) {
      const birthDate = new Date(dog.dateOfBirth);
      const ageInMonths = (new Date().getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      if (ageInMonths < 6) {
        issues.push('Too young (must be 6+ months)');
      }
    }

    // Check registrations
    if (!dog.registrations || dog.registrations.length === 0) {
      issues.push('No registration on file');
    }

    return {
      eligible: issues.length === 0,
      issues,
    };
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Loading your dogs...</p>
      </div>
    );
  }

  if (eligibleDogs.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No eligible dogs found.</p>
        <p className="text-sm text-gray-400 mt-2">
          Make sure your dogs are active and have up-to-date information.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Select Dogs to Register</h3>
        <p className="text-sm text-gray-600 mt-1">
          Choose which dogs you want to enter in this show. You can select multiple dogs.
        </p>
      </div>

      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-3">
          {eligibleDogs.map(dog => {
            const { eligible, issues } = getDogEligibilityStatus(dog);
            const isSelected = selectedDogs.includes(dog.id);

            return (
              <Card
                key={dog.id}
                className={cn(
                  'apple-dog-card cursor-pointer',
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
                      onCheckedChange={() => eligible && handleDogToggle(dog.id)}
                      onClick={e => e.stopPropagation()}
                      className="mt-1"
                    />

                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-base font-medium cursor-pointer">
                            {dog.callName || dog.name}
                            {dog.registrations?.[0]?.registeredName &&
                              ` "${dog.registrations[0].registeredName}"`}
                          </Label>
                          <p className="text-sm text-gray-600 mt-1">
                            {dog.registrations?.[0]?.breed || 'No breed specified'} •{' '}
                            {dog.gender || 'Unknown'} • Born {formatDateMMDDYYYY(dog.dateOfBirth)}
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

                      {!eligible && (
                        <div className="mt-2">
                          {issues.map((issue, idx) => (
                            <p key={idx} className="text-xs text-red-600">
                              • {issue}
                            </p>
                          ))}
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
    </div>
  );
};
