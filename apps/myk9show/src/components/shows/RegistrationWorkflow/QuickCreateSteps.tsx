import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { User as UserIcon, CheckCircle, Plus, Info } from 'lucide-react';
import { formatDogAge, getDogBreedLabel, getDogDistinctRegisteredName } from '@/types/dog-types';
import {
  QUICK_CREATE_ENTRY_ATTR,
  QUICK_CREATE_REMOVE_DOG_ATTR,
  quickCreateProgress,
} from './QuickCreateFlow.helpers';
import type { QuickCreateFlowState } from './QuickCreateFlow.types';
import { useCanEditDog } from '@/hooks/queries/useCanEditDog';

const ENTRY = { [QUICK_CREATE_ENTRY_ATTR]: '' };
const REMOVE_DOG = { [QUICK_CREATE_REMOVE_DOG_ATTR]: '' };

interface QuickCreateStepsProps {
  flowState: QuickCreateFlowState;
  mode: 'single' | 'batch';
  onOpenPersonForm: () => void;
  onEditPerson: () => void;
  onOpenDogForm: () => void;
  /** Dogs picked from the duplicate prompt, not made in this flow. */
  existingDogIds: ReadonlySet<string>;
  onEditDog: (index: number) => void;
  onRemoveDog: (index: number) => void;
}

/**
 * Edit for one dog in the list, offered only when the server would accept the save. A dog
 * made in this flow is the secretary's to fix (she created it, from this show). An existing
 * dog picked from the duplicate prompt is the owner's record until it is entered in her
 * show, so the server is asked (`useCanEditDog`) rather than offering an edit it refuses.
 */
const DogEditButton: React.FC<{ dogId: string; knownAllowed: boolean; onEdit: () => void }> = ({
  dogId,
  knownAllowed,
  onEdit,
}) => {
  const canEdit = useCanEditDog(dogId, knownAllowed);
  if (!canEdit) return null;
  return (
    <Button variant="outline" size="sm" onClick={onEdit}>
      Edit
    </Button>
  );
};

/** Quick Create's step screens: progress, then Person, Dogs or Review (MYK9-1081). */
export const QuickCreateSteps: React.FC<QuickCreateStepsProps> = ({
  flowState,
  mode,
  onOpenPersonForm,
  onEditPerson,
  onOpenDogForm,
  existingDogIds,
  onEditDog,
  onRemoveDog,
}) => (
  <div className="space-y-6">
    {/* Progress Indicator */}
    <div className="space-y-2">
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>Progress</span>
        <span>{Math.round(quickCreateProgress(flowState.step))}%</span>
      </div>
      <Progress value={quickCreateProgress(flowState.step)} className="w-full" />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className={flowState.step === 'exhibitor' ? 'font-semibold' : ''}>Add Person</span>
        <span className={flowState.step === 'dogs' ? 'font-semibold' : ''}>Add Dog(s)</span>
        <span className={flowState.step === 'review' ? 'font-semibold' : ''}>
          Review & Complete
        </span>
      </div>
    </div>

    {/* Step Content */}
    <div className="space-y-6">
      {/* Exhibitor Step */}
      {flowState.step === 'exhibitor' && (
        <div className="text-center space-y-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Add Person</h3>
            <p className="text-muted-foreground">
              First, let's add the person. This person will own the dog(s) being registered.
            </p>
          </div>

          {!flowState.exhibitor && (
            <Button onClick={onOpenPersonForm} className="flex items-center gap-2" {...ENTRY}>
              <UserIcon className="h-4 w-4" />
              Add Person
            </Button>
          )}

          {flowState.exhibitor && (
            <div className="p-4 border rounded-lg bg-success/10 border-success/20">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CheckCircle className="h-5 w-5 text-success" />
                <span className="font-semibold text-success">Person Added</span>
              </div>
              <p className="text-sm">
                {flowState.exhibitor.firstName} {flowState.exhibitor.lastName}
              </p>
              <p className="text-sm text-muted-foreground">{flowState.exhibitor.email}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={onEditPerson}
                {...ENTRY}
              >
                Edit Details
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Dogs Step */}
      {flowState.step === 'dogs' && (
        <div className="space-y-4">
          <div className="text-center space-y-2">
            <h3 className="text-lg font-semibold">Add Dog(s)</h3>
            <p className="text-muted-foreground">
              Now let's add the dog(s) for {flowState.exhibitor?.firstName}{' '}
              {flowState.exhibitor?.lastName}.
              {mode === 'batch' ? ' You can add multiple dogs.' : ' Add one dog to continue.'}
            </p>
          </div>

          {/* Dogs List */}
          {flowState.dogs.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium">Dogs Added ({flowState.dogs.length}):</h4>
              {flowState.dogs.map((dog, index) => (
                <div
                  key={dog.id}
                  className="flex flex-col gap-3 p-3 border rounded-lg sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{dog.callName}</span>
                      <Badge variant="outline">{getDogBreedLabel(dog)}</Badge>
                      <Badge variant="secondary">{dog.gender}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{dog.name}</p>
                  </div>
                  <div className="flex gap-2">
                    <DogEditButton
                      dogId={dog.id}
                      knownAllowed={!existingDogIds.has(dog.id)}
                      onEdit={() => onEditDog(index)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onRemoveDog(index)}
                      className="text-destructive hover:text-destructive"
                      {...REMOVE_DOG}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Dog Button */}
          <div className="text-center">
            <Button
              onClick={onOpenDogForm}
              className="flex items-center gap-2"
              variant={flowState.dogs.length === 0 ? 'default' : 'outline'}
              {...ENTRY}
            >
              <Plus className="h-4 w-4" />
              {flowState.dogs.length === 0 ? 'Add First Dog' : 'Add Another Dog'}
            </Button>
          </div>

          {mode === 'batch' && flowState.dogs.length > 0 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                You can add more dogs or proceed to review. All dogs will be registered for the same
                exhibitor.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Review Step */}
      {flowState.step === 'review' && (
        <div className="space-y-6">
          <div className="text-center space-y-2">
            {/* Review has no primary control of its own; its heading takes focus. */}
            <h3 className="text-lg font-semibold outline-none" tabIndex={-1} {...ENTRY}>
              Review & Complete
            </h3>
            <p className="text-muted-foreground">
              Please review the person and dog information before completing the setup.
            </p>
          </div>

          {/* Exhibitor Summary */}
          {flowState.exhibitor && (
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <UserIcon className="h-4 w-4" />
                Person Information
              </h4>
              <div className="p-4 border border-border rounded-lg bg-muted">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="font-medium">
                      {flowState.exhibitor.firstName} {flowState.exhibitor.lastName}
                    </p>
                    <p className="text-sm text-muted-foreground">{flowState.exhibitor.email}</p>
                    <p className="text-sm text-muted-foreground">{flowState.exhibitor.phone}</p>
                  </div>
                  <div>
                    {flowState.exhibitor.streetAddress && (
                      <div className="text-sm text-muted-foreground">
                        <p>{flowState.exhibitor.streetAddress}</p>
                        <p>
                          {flowState.exhibitor.city}, {flowState.exhibitor.state}{' '}
                          {flowState.exhibitor.zipCode}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* Dogs Summary */}
          <div className="space-y-3">
            <h4 className="font-medium">Dog Information ({flowState.dogs.length})</h4>
            <div className="space-y-3">
              {flowState.dogs.map(dog => (
                <div key={dog.id} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{dog.callName}</span>
                        <Badge variant="outline">{getDogBreedLabel(dog)}</Badge>
                        <Badge variant="secondary">{dog.gender}</Badge>
                      </div>
                      {/* Suppressed when it would only repeat the call
                              name printed just above (MYK9-485 review round 2):
                              "Registered Name: Maple" under Maple is noise on a
                              summary a secretary is checking for mistakes. */}
                      {getDogDistinctRegisteredName(dog) && (
                        <p className="text-sm text-muted-foreground">
                          Registered Name: {getDogDistinctRegisteredName(dog)}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        Born: {dog.dateOfBirth}
                        {formatDogAge({ dateOfBirth: dog.dateOfBirth })
                          ? ` (${formatDogAge({ dateOfBirth: dog.dateOfBirth })})`
                          : ''}
                      </p>
                      {dog.registrations && dog.registrations.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                          Registration: {dog.registrations[0].organization} -{' '}
                          {dog.registrations[0].registrationNumber}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              {/* MYK9-832 #6: the person and dog(s) are already saved by this
                        point (CreateExhibitorDialog / AddDogPanel write on their own
                        Save) — Complete Setup only carries them into this
                        registration, and Cancel does NOT remove the saved rows. */}
              The person and {flowState.dogs.length === 1 ? 'dog have' : 'dogs have'} already been
              saved. Complete Setup to use them for this registration.
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  </div>
);
