/**
 * The class picker for a request that names no class (a legacy, secretary-made
 * move-up). An exhibitor's request never reaches this dialog: Accept moves it to
 * the class the exhibitor asked for (MYK9-1978).
 */
import React, { useState } from 'react';
import { AlertCircle, Check, Loader2, Users } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ClassWithCapacity } from '@/services/database/day-of-operations';
import type { RegistryId } from '@/features/registries';
import { getAvailableMoveUpTargets, hasConfiguredCapacity } from './moveUpTargets';

export interface PickerRequest {
  class_id: string | null;
  dog: { name: string; call_name: string | null } | null;
  class: { name: string } | null;
}

interface MoveUpApproveDialogProps {
  request: PickerRequest | null;
  classes: ClassWithCapacity[];
  classesError: boolean;
  registryId: RegistryId;
  isProcessing: boolean;
  onApprove: (targetClassId: string) => void;
  onClose: () => void;
}

export const MoveUpApproveDialog: React.FC<MoveUpApproveDialogProps> = ({
  request,
  classes,
  classesError,
  registryId,
  isProcessing,
  onApprove,
  onClose,
}) => {
  const [targetClassId, setTargetClassId] = useState<string>('');
  return (
    // Keyed by the caller on the request id, so the choice resets per request.
    <Dialog open={request !== null} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accept class change</DialogTitle>
          <DialogDescription>
            Move {request?.dog?.call_name ?? request?.dog?.name} from {request?.class?.name} to the
            class you choose. This request did not name one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {(() => {
            const targetOptions = request
              ? getAvailableMoveUpTargets(classes, request.class_id, registryId)
              : [];

            // The class-capacity read failed, so an empty target list means
            // "we don't know", not "there is nowhere to move up to". Stating
            // the domain conclusion here would have the secretary deny a
            // legitimate request on the strength of data that never loaded.
            if (classesError) {
              return (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" aria-hidden />
                  <AlertDescription>
                    We couldn&rsquo;t load this show&rsquo;s classes, so we can&rsquo;t tell which
                    ones <strong>{request?.dog?.call_name ?? 'this dog'}</strong> could move up to.
                    Retry from the class change list before accepting or declining.
                  </AlertDescription>
                </Alert>
              );
            }

            if (targetOptions.length === 0) {
              return (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No valid move-up target for <strong>{request?.class?.name}</strong>. A move-up
                    must be to a higher level within the same element, and this show has no higher
                    class available.
                  </AlertDescription>
                </Alert>
              );
            }

            return (
              <div className="space-y-2">
                <label className="text-sm font-medium">Target Class</label>
                <Select value={targetClassId} onValueChange={setTargetClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select target class" />
                  </SelectTrigger>
                  <SelectContent>
                    {targetOptions.map(cls => (
                      <SelectItem key={cls.id} value={cls.id}>
                        <div className="flex items-center justify-between gap-4">
                          <span>
                            {cls.class_number && `#${cls.class_number} - `}
                            {cls.name}
                          </span>
                          {hasConfiguredCapacity(cls) && (
                            <Badge variant="outline" className="ml-2">
                              {cls.available_spots} spots
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })()}

          {targetClassId && (
            <Alert>
              <Users className="h-4 w-4" />
              <AlertDescription>
                {(() => {
                  const targetClass = classes.find(c => c.id === targetClassId);
                  if (!targetClass) return null;
                  if (!hasConfiguredCapacity(targetClass)) {
                    return (
                      <>
                        <strong>{targetClass.name}</strong> has{' '}
                        <strong>{targetClass.accepted_count}</strong>{' '}
                        {targetClass.accepted_count === 1 ? 'entry' : 'entries'} (no entry cap set)
                      </>
                    );
                  }
                  return (
                    <>
                      <strong>{targetClass.name}</strong> has{' '}
                      <strong>{targetClass.available_spots}</strong> spots available (
                      {targetClass.accepted_count}/{targetClass.max_entries} filled)
                    </>
                  );
                })()}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            onClick={() => onApprove(targetClassId)}
            disabled={isProcessing || !targetClassId}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Accept
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
