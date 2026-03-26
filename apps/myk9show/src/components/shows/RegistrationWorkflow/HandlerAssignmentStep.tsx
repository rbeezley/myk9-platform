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

type EditingTarget =
  | { kind: 'single'; entryKey: string; dogId: string }
  | { kind: 'all'; dogId: string };

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
  const [editingTarget, setEditingTarget] = useState<EditingTarget | null>(null);

  // Pre-build lookup maps for O(1) access
  const classMap = useMemo(() => new Map(classes.map(c => [c.id, c])), [classes]);

  // Build grouped data: entries grouped by dog
  const dogGroups = useMemo(() => {
    return selectedDogs
      .map(dogId => {
        const dog = dogs.find(d => d.id === dogId);
        if (!dog) return null;

        const dogClassSelections = classSelections.filter(s => s.dogId === dogId);
        const entries = dogClassSelections.flatMap(s =>
          s.selectedClasses.map(cls => {
            const classData = classMap.get(cls.classId);
            const key = makeHandlerKey(dogId, cls.classId);
            const handler = handlerAssignments[key];
            return {
              key,
              classId: cls.classId,
              className: classData?.className || classData?.element || 'Unknown Class',
              handler,
              hasHandler: !!handler?.handlerName,
            };
          })
        );

        return { dog, entries };
      })
      .filter((g): g is NonNullable<typeof g> => g !== null && g.entries.length > 0);
  }, [selectedDogs, dogs, classSelections, classMap, handlerAssignments]);

  // Check if all entries are assigned
  const totalEntries = dogGroups.reduce((sum, g) => sum + g.entries.length, 0);
  const assignedEntries = dogGroups.reduce(
    (sum, g) => sum + g.entries.filter(e => e.hasHandler).length,
    0
  );
  const allAssigned = totalEntries > 0 && assignedEntries === totalEntries;

  // When the dialog saves, apply the handler to the appropriate key(s)
  const handleDialogSave = (assignments: Record<string, HandlerInfo>) => {
    if (!editingTarget) return;

    const newAssignments = { ...handlerAssignments };
    const dogId = editingTarget.dogId;
    const handler = assignments[dogId];

    if (!handler) {
      setEditingTarget(null);
      return;
    }

    if (editingTarget.kind === 'all') {
      // Apply handler to all of this dog's entries
      const dogClassSelections = classSelections.filter(s => s.dogId === dogId);
      dogClassSelections.forEach(s => {
        s.selectedClasses.forEach(cls => {
          newAssignments[makeHandlerKey(dogId, cls.classId)] = handler;
        });
      });
    } else {
      // Single entry
      newAssignments[editingTarget.entryKey] = handler;
    }

    onHandlerAssignmentChange(newAssignments);
    setEditingTarget(null);
  };

  const editingDogId = editingTarget?.dogId ?? null;

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
            {assignedEntries} of {totalEntries} entries have handlers assigned. Assign handlers to
            all entries to continue.
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
                    onClick={() => setEditingTarget({ kind: 'all', dogId: dog.id })}
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
                        <span className="text-sm text-destructive font-medium">Not assigned</span>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setEditingTarget({ kind: 'single', entryKey: entry.key, dogId: dog.id })
                        }
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
            if (!open) setEditingTarget(null);
          }}
          selectedDogs={[editingDogId]}
          dogs={dogs}
          onHandlerAssignment={handleDialogSave}
          initialAssignments={
            editingTarget?.kind === 'single' && handlerAssignments[editingTarget.entryKey]
              ? {
                  [editingDogId]: handlerAssignments[editingTarget.entryKey],
                }
              : {}
          }
        />
      )}
    </div>
  );
};
