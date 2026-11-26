import React, { useCallback, useEffect, useMemo } from 'react';
import { UserRound } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useTrialStore } from '@/store/trialStore';
import { makeHandlerKey } from '@/types/show-registration-types';
import type { ClassSelectionData, HandlerInfo } from '@/types/show-registration-types';
import { getDogDisplayName } from '@/types/dog-types';
import {
  clashHandlerName,
  clashQuestion,
  findHandlerClashes,
  isClashAnswered,
  type ClashClassInfo,
  type HandlerClash,
} from './handlerClashes';

export interface HandlerClashSectionProps {
  selectedDogs: string[];
  classSelections: ClassSelectionData[];
  existingEntries: readonly { dogId: string; classId: string }[];
  handlerAssignments: Record<string, HandlerInfo>;
  onHandlerAssignmentChange: (assignments: Record<string, HandlerInfo>) => void;
  /** Dog pairs the exhibitor chose "I'll decide at the show" for. */
  deferredPairKeys: string[];
  onDeferredChange: (pairKeys: string[]) => void;
  /** How many questions still have no answer; the wizard blocks Continue on it. */
  onPendingChange: (count: number) => void;
  /** Secretary or admin keying the entry: the question names the owner instead of saying "you". */
  staff?: boolean;
}

/**
 * MYK9-2021: asks who will handle a dog only when one owner has two dogs in the
 * same class (she cannot run both). Renders nothing otherwise. A typed handler
 * stays a name: no account, no email. "I'll decide at the show" leaves the
 * handler as the owner and stores nothing new but the choice itself.
 */
export const HandlerClashSection: React.FC<HandlerClashSectionProps> = ({
  selectedDogs,
  classSelections,
  existingEntries,
  handlerAssignments,
  onHandlerAssignmentChange,
  deferredPairKeys,
  onDeferredChange,
  onPendingChange,
  staff = false,
}) => {
  const { dogs } = useDogStoreCompat();
  const { classes: queryClasses = [] } = useClassStoreCompat();
  const trialClasses = useTrialStore(s => s.trialClasses);

  const classInfo = useMemo(() => {
    const map = new Map<string, ClashClassInfo>();
    for (const cls of queryClasses) {
      map.set(cls.id, {
        trialId: cls.trialId,
        element: cls.element,
        level: cls.level,
        section: cls.section,
      });
    }
    for (const [trialId, list] of Object.entries(trialClasses || {})) {
      for (const cls of list) {
        map.set(cls.id, {
          trialId,
          element: cls.element,
          level: cls.level,
          section: cls.section,
        });
      }
    }
    return map;
  }, [queryClasses, trialClasses]);

  const clashes = useMemo(
    () =>
      findHandlerClashes({
        selectedDogIds: selectedDogs,
        classSelections,
        dogs: dogs.map(dog => ({
          id: dog.id,
          ownerId: dog.ownerId,
          name: getDogDisplayName(dog),
        })),
        existingEntries,
        getClass: classId => classInfo.get(classId),
      }),
    [selectedDogs, classSelections, dogs, existingEntries, classInfo]
  );

  const pending = clashes.filter(
    clash => !isClashAnswered(clash, handlerAssignments, deferredPairKeys)
  ).length;
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);

  const writeHandler = useCallback(
    (clash: HandlerClash, handler: HandlerInfo) => {
      const next = { ...handlerAssignments };
      for (const classId of clash.subjectClassIds) {
        next[makeHandlerKey(clash.subjectDogId, classId)] = handler;
      }
      onHandlerAssignmentChange(next);
    },
    [handlerAssignments, onHandlerAssignmentChange]
  );

  const ownerHandler = (clash: HandlerClash): HandlerInfo => {
    const dog = dogs.find(d => d.id === clash.subjectDogId);
    return {
      handlerId: dog?.ownerId ?? '',
      handlerName: dog?.ownerName || 'Owner',
      isOwner: true,
    };
  };

  if (clashes.length === 0) return null;

  return (
    <div className="mt-4 space-y-3" data-testid="handler-clashes">
      {clashes.map(clash => {
        const deferred = deferredPairKeys.includes(clash.pairKey);
        const inputId = `handler-clash-${clash.pairKey}`;
        return (
          <div key={clash.pairKey} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-start gap-2">
              <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <label htmlFor={inputId} className="text-sm font-medium">
                {clashQuestion(
                  clash,
                  staff
                    ? { ownerName: dogs.find(d => d.id === clash.subjectDogId)?.ownerName }
                    : undefined
                )}
              </label>
            </div>
            <Input
              id={inputId}
              className="h-11"
              placeholder="Handler's name"
              value={clashHandlerName(clash, handlerAssignments)}
              onChange={event => {
                const value = event.target.value;
                if (deferred) {
                  onDeferredChange(deferredPairKeys.filter(key => key !== clash.pairKey));
                }
                writeHandler(
                  clash,
                  value.trim()
                    ? { handlerId: '', handlerName: value, isOwner: false }
                    : ownerHandler(clash)
                );
              }}
            />
            <label
              htmlFor={`${inputId}-later`}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1"
            >
              <Checkbox
                id={`${inputId}-later`}
                checked={deferred}
                onCheckedChange={value => {
                  if (value !== true) {
                    onDeferredChange(deferredPairKeys.filter(key => key !== clash.pairKey));
                    return;
                  }
                  writeHandler(clash, ownerHandler(clash));
                  onDeferredChange([...deferredPairKeys, clash.pairKey]);
                }}
              />
              <span className="text-sm">I'll decide at the show</span>
            </label>
          </div>
        );
      })}
    </div>
  );
};
