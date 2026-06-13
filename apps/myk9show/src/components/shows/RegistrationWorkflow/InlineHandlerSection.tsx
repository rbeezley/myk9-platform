import React, { useState, useMemo } from 'react';
import { CheckCircle, ChevronDown, Edit2, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { ClassSelectionData, HandlerInfo, makeHandlerKey } from '@/types/show-registration-types';
import { getDogDisplayName } from '@/types/dog-types';
import { HandlerSelectionDialog } from './HandlerSelectionDialog';

interface InlineHandlerSectionProps {
  selectedDogs: string[];
  classSelections: ClassSelectionData[];
  handlerAssignments: Record<string, HandlerInfo>;
  onHandlerAssignmentChange: (assignments: Record<string, HandlerInfo>) => void;
}

type EditingTarget = { entryKey: string; dogId: string };

export const InlineHandlerSection: React.FC<InlineHandlerSectionProps> = ({
  selectedDogs,
  classSelections,
  handlerAssignments,
  onHandlerAssignmentChange,
}) => {
  const { dogs } = useDogStoreCompat();
  const { classes } = useClassStoreCompat();
  const [editingTarget, setEditingTarget] = useState<EditingTarget | null>(null);

  const classMap = useMemo(() => new Map(classes.map(c => [c.id, c])), [classes]);

  // Build flat list of entries with handler info
  const entries = useMemo(() => {
    return selectedDogs.flatMap(dogId => {
      const dog = dogs.find(d => d.id === dogId);
      if (!dog) return [];

      const dogSelections = classSelections.filter(s => s.dogId === dogId);
      return dogSelections.flatMap(s =>
        s.selectedClasses.map(cls => {
          const classData = classMap.get(cls.classId);
          const key = makeHandlerKey(dogId, cls.classId);
          const handler = handlerAssignments[key];
          return {
            key,
            dogId,
            dogName: getDogDisplayName(dog),
            classId: cls.classId,
            className: classData?.className || classData?.element || 'Unknown Class',
            handler,
            hasHandler: !!handler?.handlerName,
          };
        })
      );
    });
  }, [selectedDogs, dogs, classSelections, classMap, handlerAssignments]);

  const allAssigned = entries.length > 0 && entries.every(e => e.hasHandler);
  const assignedCount = entries.filter(e => e.hasHandler).length;

  // Handler dialog save — apply to single entry
  const handleDialogSave = (assignments: Record<string, HandlerInfo>) => {
    if (!editingTarget) return;
    const handler = assignments[editingTarget.dogId];
    if (!handler) {
      setEditingTarget(null);
      return;
    }

    const newAssignments = { ...handlerAssignments };
    newAssignments[editingTarget.entryKey] = handler;
    onHandlerAssignmentChange(newAssignments);
    setEditingTarget(null);
  };

  if (entries.length === 0) return null;

  return (
    <div className="mt-4 border rounded-lg">
      <Collapsible defaultOpen={!allAssigned}>
        <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors rounded-lg">
          <div className="flex items-center gap-2">
            {allAssigned ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">
              {allAssigned
                ? 'Handlers assigned'
                : `Handlers: ${assignedCount} of ${entries.length} assigned`}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 space-y-2">
            {entries.map(entry => (
              <div
                key={entry.key}
                className="flex flex-col items-start gap-2 py-2 px-3 rounded-md bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-sm truncate">
                    {entry.dogName} — {entry.className}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0 sm:ml-3">
                  {entry.hasHandler && entry.handler ? (
                    <div className="flex items-center gap-1.5">
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
                    onClick={() => setEditingTarget({ entryKey: entry.key, dogId: entry.dogId })}
                    className="h-8 px-2.5"
                  >
                    <Edit2 className="h-3 w-3 mr-1" />
                    Change
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Handler Selection Dialog */}
      {editingTarget && (
        <HandlerSelectionDialog
          open={!!editingTarget}
          onOpenChange={open => {
            if (!open) setEditingTarget(null);
          }}
          selectedDogs={[editingTarget.dogId]}
          dogs={dogs}
          onHandlerAssignment={handleDialogSave}
          initialAssignments={
            handlerAssignments[editingTarget.entryKey]
              ? { [editingTarget.dogId]: handlerAssignments[editingTarget.entryKey] }
              : {}
          }
        />
      )}
    </div>
  );
};
