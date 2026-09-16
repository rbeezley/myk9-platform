import React from 'react';
import { Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { getAgeInMonths } from '@/hooks/useEntryEligibility';
import {
  getDogDisplayName,
  getDogBreedLabel,
  getDogDistinctRegisteredName,
  Dog,
  type Registration,
} from '@/types/dog-types';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/common/SkeletonLoaders';
import { SearchBar } from '@/components/common/SearchBar';
import { Button } from '@/components/ui/button';
import { AddEditRegistrationDialog } from '@/components/dogs/AddEditRegistrationDialog';
import { useInlineDogRegistration } from './useInlineDogRegistration';
import { resolveRegistrationForShow, type RegistrationForShow } from './dogRegistrationForShow';
import { normalizeOrganization } from '@/features/dogs/identity';
import '@/styles/myk9-registration-workflow.css';

/**
 * "AKC: SR12345601", or just "AKC" when the number is missing — never "AKC: ".
 *
 * The organization is NORMALIZED for display. Every live
 * `dog_registrations.organization` row holds the long form
 * ("AKC (American Kennel Club)"), which rendered raw makes a 50-character pill
 * that wraps to two lines on a 375px phone. `normalizeOrganization` is the same
 * function the matching uses, so the chip can never name a registry the resolver
 * would not have matched. Falls back to the raw value if it normalizes to
 * nothing — showing something odd beats showing an empty chip.
 */
function registrationLabel(registration: Registration): string {
  const organization =
    normalizeOrganization(registration.organization) ?? registration.organization;
  const number = registration.registrationNumber?.trim();
  return number ? `${organization}: ${number}` : organization;
}

interface DogSelectionStepProps {
  selectedDogs: string[];
  onSelectionChange: (dogIds: string[]) => void;
  /**
   * The show's sanctioning registry, already resolved through
   * `@/features/registries` by the caller (never a raw column read).
   * Undefined = not known yet; the card then marks nothing and blocks nobody.
   */
  showRegistryId?: string | null | undefined;
}

export const DogSelectionStep: React.FC<DogSelectionStepProps> = ({
  selectedDogs,
  onSelectionChange,
  showRegistryId,
}) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const { dogs, isLoading, error, refetch } = useDogStoreCompat();
  const { registrationDogId, openRegistrationEditor, closeRegistrationEditor, saveRegistration } =
    useInlineDogRegistration(refetch);

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

  const query = searchQuery.trim().toLowerCase();
  const visibleDogs = eligibleDogs.filter(dog =>
    getDogDisplayName(dog).toLowerCase().includes(query)
  );

  const handleDogToggle = (dogId: string) => {
    if (selectedDogs.includes(dogId)) {
      onSelectionChange(selectedDogs.filter(id => id !== dogId));
    } else {
      onSelectionChange([...selectedDogs, dogId]);
    }
  };

  const getDogEligibilityStatus = (dog: Dog, forShow: RegistrationForShow) => {
    const issues: string[] = [];
    const warnings: string[] = [];

    if (dog.dateOfBirth && getAgeInMonths(dog.dateOfBirth) < 6) {
      issues.push('Too young (must be 6+ months)');
    }

    // INTENT: a missing registration is SAID here, never enforced here. The
    // registry that decides eligibility is per-trial, and `ClassSelectionStep`
    // already refuses the class through `getRegistrationPrerequisite` — which
    // carries the conformation-puppy carve-out the DB trigger honours. A
    // show-wide block at step 1 would both lose that carve-out and strand a dog
    // selected before the registry resolved: once trials hydrated the checkbox
    // went disabled with the dog still in the cart (MYK9-569 review round 1).
    //
    // Registration stays a warning only. `[]` is proof of absence ONLY when the
    // read completed: `mapDatabaseToDog` emits `registrations: []` for a failed
    // read too, so an offline exhibitor must not be told her dogs are
    // unregistered. Suppressed when the registry-specific message below already
    // says the same thing more usefully.
    const registrationsKnownEmpty =
      dog.registrations?.length === 0 && dog.registrationsReadComplete !== false;
    if (registrationsKnownEmpty && !forShow.missingRegistration) {
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

  if (error) {
    return (
      <div role="alert" className="space-y-3 py-8 text-center">
        <p>We couldn't load your dogs. Please try again.</p>
        <Button type="button" variant="outline" size="touch" onClick={refetch}>
          Try again
        </Button>
      </div>
    );
  }

  if (eligibleDogs.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No eligible dogs found.</p>
        <p className="text-sm text-muted-foreground mt-2">
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

      <div className="space-y-2">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search dogs by call name"
          aria-label="Search dogs by call name"
        />
        <p role="status" className="text-sm text-muted-foreground">
          {visibleDogs.length === 0
            ? 'No dogs match your search. Try another call name or clear the search.'
            : `${visibleDogs.length} of ${eligibleDogs.length} dogs shown`}
        </p>
      </div>

      <ScrollArea className="h-auto pr-0 md:h-[400px] md:pr-4">
        <div className="space-y-3">
          {visibleDogs.map(dog => {
            const forShow = resolveRegistrationForShow(dog, showRegistryId);
            const { eligible, issues, warnings } = getDogEligibilityStatus(dog, forShow);
            const isSelected = selectedDogs.includes(dog.id);
            // Same visibility rule as before this change: the fix affordance rides with
            // the warning, and an already-ineligible dog does not get one.
            const showAddRegistration =
              eligible && (warnings.length > 0 || forShow.missingRegistration);

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
                    {/* The 44px touch floor belongs to this WRAPPER, never to
                      the checkbox's painted box: sizing the control itself gave
                      a 44px square around a 16px tick (MYK9-485). The whole
                      Card also toggles selection, so this hit area is a second
                      one, not the only one. */}
                    <span className="flex min-h-11 min-w-11 shrink-0 items-center justify-center">
                      <Checkbox
                        aria-label={`Select ${getDogDisplayName(dog)}`}
                        checked={isSelected}
                        disabled={!eligible}
                        onCheckedChange={() => handleDogToggle(dog.id)}
                        onClick={e => e.stopPropagation()}
                      />
                    </span>

                    <div className="min-w-0 flex-1">
                      {/* Selection is signalled TWICE, not three times: the
                        checkbox and the card's primary border. The "Selected"
                        badge that used to sit at the end of this row said the
                        same thing a third time, one row-width away from the
                        control that sets it (MYK9-485). */}
                      <div>
                        <Label className="break-words text-base font-medium text-foreground cursor-pointer">
                          {getDogDisplayName(dog)}
                          {getDogDistinctRegisteredName(dog) &&
                            ` "${getDogDistinctRegisteredName(dog)}"`}
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          {getDogBreedLabel(dog)} • {dog.gender || 'Unknown'} • Born{' '}
                          {formatDateMMDDYYYY(dog.dateOfBirth)}
                        </p>
                      </div>

                      {/* INTENT: the registry the show uses is decided by the show,
                        not by the exhibitor (MYK9-490). The other registrations stay
                        VISIBLE but de-emphasized — a tester read three equal chips as
                        an unmade choice, and hiding them would instead read as her
                        dog's other numbers having been lost (MYK9-569). Text size
                        stays at text-xs: do not shrink it further (MYK9-368). */}
                      {(forShow.used || forShow.others.length > 0) && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {forShow.used && (
                            <Badge
                              data-registration-role="used"
                              variant="outline"
                              className="max-w-full whitespace-normal break-words border-primary bg-primary/10 text-xs font-semibold text-foreground"
                            >
                              {registrationLabel(forShow.used)}
                              {/* Without a separator the accessible name runs the
                                number into the marker: "SR12345601Used for this
                                show". */}
                              <span className="sr-only">, </span>
                              <span className="ml-1.5 font-normal text-muted-foreground">
                                Used for this show
                              </span>
                            </Badge>
                          )}
                          {forShow.others.map(reg => (
                            <Badge
                              key={reg.id}
                              data-registration-role="other"
                              variant="outline"
                              className={cn(
                                'max-w-full whitespace-normal break-words text-xs',
                                // De-emphasis is the TOKEN COLOUR only. Never
                                // opacity on text: muted-foreground at 60%
                                // composites to ~2.5:1 at 12px, under the 4.5:1
                                // AA floor the token itself was fixed to meet.
                                forShow.resolved && 'border-border/60 text-muted-foreground'
                              )}
                            >
                              {registrationLabel(reg)}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {forShow.missingRegistrationMessage && (
                        // role="status": the registry resolves after the first
                        // paint, so this appears while she is already reading.
                        <p role="status" className="mt-2 text-xs text-destructive">
                          • {forShow.missingRegistrationMessage}
                        </p>
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
                        </div>
                      )}

                      {showAddRegistration && (
                        <div className="mt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="touch"
                            onClick={event => {
                              event.stopPropagation();
                              openRegistrationEditor(dog.id);
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
          onOpenChange={open => !open && closeRegistrationEditor()}
          onSave={saveRegistration}
        />
      </div>
    </div>
  );
};
