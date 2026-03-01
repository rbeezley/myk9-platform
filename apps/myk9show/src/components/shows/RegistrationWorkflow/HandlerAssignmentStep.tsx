import React, { useState, useMemo } from 'react';
import { UserCheck, Edit2, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { ClassSelectionData, HandlerInfo } from '@/types/show-registration-types';
import { HandlerSelectionDialog } from './HandlerSelectionDialog';

interface HandlerAssignmentStepProps {
  selectedDogs: string[];
  classSelections: ClassSelectionData[];
  handlerAssignments: Record<string, HandlerInfo>;
  onHandlerAssignmentChange: (assignments: Record<string, HandlerInfo>) => void;
  showId: string;
}

export const HandlerAssignmentStep: React.FC<HandlerAssignmentStepProps> = ({
  selectedDogs,
  classSelections,
  handlerAssignments,
  onHandlerAssignmentChange,
  showId,
}) => {
  const { dogs, isLoading } = useDogStoreCompat();
  const [editingDogId, setEditingDogId] = useState<string | null>(null);

  // Auto-assign is handled by RegistrationWorkflow (render-time sync when dogs are selected).
  // This component only displays and allows overriding assignments.

  // Get dogs with their information
  const dogsWithInfo = useMemo(() => {
    return selectedDogs
      .map(dogId => {
        const dog = dogs.find(d => d.id === dogId);
        if (!dog) return null;

        const handlerInfo = handlerAssignments[dogId];
        const dogClasses = classSelections.filter(c => c.dogId === dogId);

        return {
          dog,
          handlerInfo,
          classCount: dogClasses.length,
          hasHandler: !!handlerInfo?.handlerId,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [selectedDogs, dogs, handlerAssignments, classSelections]);

  const allAssigned = selectedDogs.every(dogId => handlerAssignments[dogId]?.handlerId);

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Loading dog information...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status */}
      {allAssigned ? (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            All dogs are assigned to their owners as handlers. You can proceed or change individual
            assignments below.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Some dogs still need handler assignments. Owners are assigned by default.
          </AlertDescription>
        </Alert>
      )}

      {/* Dog Handler List */}
      <div className="space-y-3">
        {dogsWithInfo.map(({ dog, handlerInfo, classCount, hasHandler }) => (
          <Card key={dog.id}>
            <CardContent className="py-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold">{dog.callName || dog.name}</h4>
                <p className="text-sm text-muted-foreground truncate">
                  {dog.breed} &bull; {classCount} {classCount === 1 ? 'class' : 'classes'}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {hasHandler && handlerInfo ? (
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">{handlerInfo.handlerName}</span>
                    <Badge variant="secondary" className="text-xs">
                      {handlerInfo.isOwner ? 'Owner' : 'Handler'}
                    </Badge>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Assigning...</span>
                )}

                <Button variant="ghost" size="sm" onClick={() => setEditingDogId(dog.id)}>
                  <Edit2 className="h-3 w-3 mr-1" />
                  Change
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {dogsWithInfo.length === 0 && selectedDogs.length > 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No dog information found. Please go back and select dogs.</p>
          </div>
        )}
      </div>

      {/* Handler Selection Dialog (only for override) */}
      {editingDogId && (
        <HandlerSelectionDialog
          open={!!editingDogId}
          onOpenChange={open => {
            if (!open) setEditingDogId(null);
          }}
          selectedDogs={[editingDogId]}
          showId={showId}
          dogs={dogs}
          onHandlerAssignment={assignments => {
            onHandlerAssignmentChange({ ...handlerAssignments, ...assignments });
          }}
          initialAssignments={
            handlerAssignments[editingDogId]
              ? { [editingDogId]: handlerAssignments[editingDogId] }
              : {}
          }
        />
      )}
    </div>
  );
};
