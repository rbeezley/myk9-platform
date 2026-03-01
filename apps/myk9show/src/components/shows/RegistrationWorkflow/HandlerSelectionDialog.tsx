import React, { useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { HandlerInfo } from '@/types/show-registration-types';
import { getDogDisplayName, type Dog } from '@/types/dog-types';

interface HandlerSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDogs: string[];
  showId: string;
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
  // Build initial handler name from existing assignment or owner
  const getInitialName = (dogId: string): string => {
    const existing = initialAssignments[dogId];
    if (existing?.handlerName) return existing.handlerName;
    const dog = dogs.find(d => d.id === dogId);
    return dog?.ownerName || '';
  };

  const [handlerNames, setHandlerNames] = useState<Record<string, string>>(() => {
    const names: Record<string, string> = {};
    selectedDogs.forEach(dogId => {
      names[dogId] = getInitialName(dogId);
    });
    return names;
  });
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
      const isOwner = !!dog?.ownerName && name === dog.ownerName;

      assignments[dogId] = {
        handlerId: isOwner && dog?.ownerId ? dog.ownerId : 'custom',
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
      setHasError(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg flex flex-col max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Change Handler</DialogTitle>
          <DialogDescription>
            Enter the name of the person who will handle this dog in the ring.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {selectedDogs.map(dogId => {
            const dog = dogs.find(d => d.id === dogId);
            if (!dog) return null;

            const ownerName = dog.ownerName;
            const currentName = handlerNames[dogId] || '';
            const isModified = !!ownerName && currentName !== ownerName;
            const isEmpty = !currentName.trim();

            return (
              <Card key={dogId} className={hasError && isEmpty ? 'border-destructive' : ''}>
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

                  <div className="space-y-1.5">
                    <Label htmlFor={`handler-${dogId}`}>Handler name</Label>
                    <div className="flex gap-2">
                      <Input
                        id={`handler-${dogId}`}
                        value={currentName}
                        onChange={e => {
                          setHandlerNames(prev => ({ ...prev, [dogId]: e.target.value }));
                          setHasError(false);
                        }}
                        placeholder="Enter handler name"
                        className={hasError && isEmpty ? 'border-destructive' : ''}
                      />
                      {isModified && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => resetToOwner(dogId)}
                          title="Reset to owner"
                          className="shrink-0"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {hasError && isEmpty && (
                      <p className="text-sm text-destructive">Handler name is required</p>
                    )}
                  </div>
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
