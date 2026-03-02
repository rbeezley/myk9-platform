import React, { useState, useMemo } from 'react';
import { UserCheck, Edit2, CheckCircle, AlertCircle, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { ClassSelectionData, HandlerInfo, makeHandlerKey } from '@/types/show-registration-types';
import { getDogDisplayName } from '@/types/dog-types';
import { HandlerSelectionDialog } from './HandlerSelectionDialog';

interface HandlerAssignmentStepProps {
  selectedDogs: string[];
  classSelections: ClassSelectionData[];
  handlerAssignments: Record<string, HandlerInfo>;
  onHandlerAssignmentChange: (assignments: Record<string, HandlerInfo>) => void;
}

export const HandlerAssignmentStep: React.FC<HandlerAssignmentStepProps> = ({
  selectedDogs,
  classSelections,
  handlerAssignments,
  onHandlerAssignmentChange,
}) => {
  const { dogs, isLoading } = useDogStoreCompat();
  const { classes } = useClassStoreCompat();
  // editingKey: handler key (dogId|classId) for single entry, or "all|dogId" for set-all
  const [editingKey, setEditingKey] = useState<string | null>(null);

  // Build grouped data: entries grouped by dog
  const dogGroups = useMemo(() => {
    return selectedDogs
      .map(dogId => {
        const dog = dogs.find(d => d.id === dogId);
        if (!dog) return null;

        const dogClassSelections = classSelections.filter(s => s.dogId === dogId);
        const entries = dogClassSelections.flatMap(s =>
          s.selectedClasses.map(cls => {
            const classData = classes.find(c => c.id === cls.classId);
            const key = makeHandlerKey(dogId, cls.classId);
            const handler = handlerAssignments[key];
            return {
              key,
              classId: cls.classId,
              className: classData?.className || classData?.element || 'Unknown Class',
              handler,
              hasHandler: !!handler?.handlerId,
            };
          })
        );

        return { dog, entries };
      })
      .filter((g): g is NonNullable<typeof g> => g !== null && g.entries.length > 0);
  }, [selectedDogs, dogs, classSelections, classes, handlerAssignments]);

  // Check if all entries are assigned
  const totalEntries = dogGroups.reduce((sum, g) => sum + g.entries.length, 0);
  const assignedEntries = dogGroups.reduce(
    (sum, g) => sum + g.entries.filter(e => e.hasHandler).length,
    0
  );
  const allAssigned = totalEntries > 0 && assignedEntries === totalEntries;

  // When the dialog saves, apply the handler to the appropriate key(s)
  const handleDialogSave = (assignments: Record<string, HandlerInfo>) => {
    if (!editingKey) return;

    const newAssignments = { ...handlerAssignments };

    if (editingKey.startsWith('all|')) {
      // "Set all for dog" — apply the handler to all of this dog's entries
      const dogId = editingKey.slice(4);
      // The dialog returns { [dogId]: HandlerInfo } — extract the handler
      const handler = assignments[dogId];
      if (handler) {
        const dogClassSelections = classSelections.filter(s => s.dogId === dogId);
        dogClassSelections.forEach(s => {
          s.selectedClasses.forEach(cls => {
            newAssignments[makeHandlerKey(dogId, cls.classId)] = handler;
          });
        });
      }
    } else {
      // Single entry — the dialog returns { [dogId]: HandlerInfo }
      const dogId = Object.keys(assignments)[0];
      const handler = assignments[dogId];
      if (handler) {
        newAssignments[editingKey] = handler;
      }
    }

    onHandlerAssignmentChange(newAssignments);
    setEditingKey(null);
  };

  // Get the dogId for the currently editing key
  const editingDogId = useMemo(() => {
    if (!editingKey) return null;
    if (editingKey.startsWith('all|')) return editingKey.slice(4);
    // Parse the handler key to get dogId
    const pipeIndex = editingKey.indexOf('|');
    return pipeIndex >= 0 ? editingKey.slice(0, pipeIndex) : null;
  }, [editingKey]);

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
            All entries have handlers assigned. You can proceed or change individual assignments
            below.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {assignedEntries} of {totalEntries} entries have handlers assigned. Owners are assigned
            by default.
          </AlertDescription>
        </Alert>
      )}

      {/* Entries grouped by dog */}
      <div className="space-y-4">
        {dogGroups.map(({ dog, entries }) => (
          <Card key={dog.id}>
            <CardContent className="py-4 space-y-3">
              {/* Dog header with "Set all" button */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">{getDogDisplayName(dog)}</h4>
                  <p className="text-sm text-muted-foreground">
                    {dog.breed} &bull; {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                  </p>
                </div>
                {entries.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingKey(`all|${dog.id}`)}
                    className="gap-1.5"
                  >
                    <Users className="h-3.5 w-3.5" />
                    Set all for {getDogDisplayName(dog).split(' ')[0]}
                  </Button>
                )}
              </div>

              {/* Per-entry rows */}
              <div className="space-y-2 pl-2 border-l-2 border-border/50">
                {entries.map(entry => (
                  <div
                    key={entry.key}
                    className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30"
                  >
                    <span className="text-sm font-medium truncate flex-1 min-w-0">
                      {entry.className}
                    </span>

                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {entry.hasHandler && entry.handler ? (
                        <div className="flex items-center gap-1.5">
                          <UserCheck className="h-3.5 w-3.5 text-green-600" />
                          <span className="text-sm">{entry.handler.handlerName}</span>
                          <Badge variant="secondary" className="text-xs">
                            {entry.handler.isOwner ? 'Owner' : 'Handler'}
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not assigned</span>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingKey(entry.key)}
                        className="h-7 px-2"
                      >
                        <Edit2 className="h-3 w-3 mr-1" />
                        Change
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        {dogGroups.length === 0 && selectedDogs.length > 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No class selections found. Please go back and select classes.</p>
          </div>
        )}
      </div>

      {/* Handler Selection Dialog */}
      {editingDogId && (
        <HandlerSelectionDialog
          open={!!editingDogId}
          onOpenChange={open => {
            if (!open) setEditingKey(null);
          }}
          selectedDogs={[editingDogId]}
          dogs={dogs}
          onHandlerAssignment={handleDialogSave}
          initialAssignments={
            editingKey && !editingKey.startsWith('all|') && handlerAssignments[editingKey]
              ? {
                  [editingDogId]: handlerAssignments[editingKey],
                }
              : {}
          }
        />
      )}
    </div>
  );
};
