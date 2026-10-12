import React, { useCallback, useRef, useState } from 'react';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { usePanelModeFocus } from '@/components/panels/usePanelModeFocus';
import { Badge } from '@/components/ui/badge';
import { CreateExhibitorDialog } from './CreateExhibitorDialog';
import { AddDogPanel } from '@/components/panels/edit';
import type { AddDogSubMode } from '@/components/panels/edit/AddDogPanel/types';
import { User, Dog } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';
import {
  quickCreateStepLabel,
  quickCreateStepsFocusTarget,
  quickCreateTitle,
  type QuickCreateView,
} from './QuickCreateFlow.helpers';
import {
  INITIAL_QUICK_CREATE_FLOW_STATE,
  type QuickCreateFlowState,
} from './QuickCreateFlow.types';
import { QuickCreateSteps } from './QuickCreateSteps';
import { QuickCreateFooter } from './QuickCreateFooter';
import { useCreatedInSession } from './CreatedInSessionContext';

interface QuickCreateFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFlowCompleted: (exhibitor: User, dogs: Dog[]) => void;
  searchQuery?: string; // Pre-fill from search if provided
  mode?: 'single' | 'batch'; // Single dog or multiple dogs
  offlineFirst?: boolean;
  /** `YYYY-MM-DD` show start, forwarded to Add Dog so its DOB warning judges age on show day. */
  showStartDate?: string | undefined;
  /** The show being entered; recorded on people and dogs created here (MYK9-1059). */
  createdFromShowId?: string | undefined;
}

/**
 * Quick Create: Add Person, Add Dog(s) and Review in ONE right slide-out
 * (MYK9-1081, docs/INTENT.md "Dialog or Slide-Out"). The Person and Dog forms
 * are views of this panel, rendered inline, never a dialog over it; Add Dog's
 * registration form is a sub-mode of the Dog view.
 *
 * Escape, the backdrop, X and Back leave a form first (with the discard prompt
 * when it is dirty). On a step screen they close the panel WITHOUT resetting,
 * so reopening resumes where the secretary was; only Cancel and Complete reset.
 */
export const QuickCreateFlow: React.FC<QuickCreateFlowProps> = ({
  open,
  onOpenChange,
  onFlowCompleted,
  searchQuery = '',
  mode = 'single',
  offlineFirst = false,
  showStartDate,
  createdFromShowId,
}) => {
  const createdInSession = useCreatedInSession();
  const [flowState, setFlowState] = useState<QuickCreateFlowState>(INITIAL_QUICK_CREATE_FLOW_STATE);
  const [view, setView] = useState<QuickCreateView>('steps');
  const [dogSubMode, setDogSubMode] = useState<AddDogSubMode>('dog');
  const closeFormRef = useRef<(() => void) | null>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const showSteps = useCallback(() => setView('steps'), []);
  const openDogForm = () => {
    setDogSubMode('dog');
    setView('dog-form');
  };

  const handleExhibitorCreated = (
    exhibitor: User,
    metadata?: { pendingMutationIds?: string[] | undefined }
  ) => {
    // Saved the moment the form saves, even if the flow is closed before it completes.
    createdInSession?.recordOwnerCreated(exhibitor);
    setFlowState(prev => ({
      ...prev,
      exhibitor,
      exhibitorPendingMutationIds: metadata?.pendingMutationIds ?? [],
      step: 'dogs',
    }));
    setView('steps');
  };

  const handleDogCreated = (dog: Dog, options?: { existing?: boolean }) => {
    if (!options?.existing) createdInSession?.recordDogCreated(dog);
    setFlowState(prev => ({
      ...prev,
      dogs: [...prev.dogs, dog],
      // In single-dog mode, advance to review as soon as the first dog is added
      step: mode === 'single' && prev.dogs.length === 0 ? 'review' : prev.step,
    }));
    setView('steps');
  };

  // Edit re-creates the dog through a blank form (unchanged, follow-up F6).
  const handleEditDog = (index: number) => {
    setFlowState(prev => ({ ...prev, dogs: prev.dogs.filter((_, i) => i !== index) }));
    openDogForm();
  };
  const removedIndexRef = useRef<number | null>(null);
  const handleRemoveDog = (index: number) => {
    removedIndexRef.current = index;
    setFlowState(prev => ({
      ...prev,
      dogs: prev.dogs.filter((_, i) => i !== index),
    }));
  };

  // Cancel and Complete: reset, then close.
  const handleClose = () => {
    setFlowState(INITIAL_QUICK_CREATE_FLOW_STATE);
    setView('steps');
    onOpenChange(false);
  };

  const handleCompleteFlow = () => {
    if (flowState.exhibitor && flowState.dogs.length > 0) {
      const updatedExhibitor: User = {
        ...flowState.exhibitor,
        dogs: flowState.dogs.map(dog => dog.id),
      };

      onFlowCompleted(updatedExhibitor, flowState.dogs);
      handleClose();
    }
  };

  // Escape, the backdrop, X and Back. In a form they ask it to close (the
  // discard prompt when dirty); on a step screen they close without a reset.
  const handlePanelClose = () => {
    if (view === 'steps') onOpenChange(false);
    else closeFormRef.current?.();
  };

  // Open the Person form when the flow goes from closed to open on a fresh start.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && flowState.step === 'exhibitor' && !flowState.exhibitor) setView('person-form');
  }

  // Focus: a form's first field going in; on the step screens, see
  // quickCreateStepsFocusTarget (also after Discard, a step change or a Remove).
  const stepsReturnTarget = useCallback(() => {
    const removed = removedIndexRef.current;
    removedIndexRef.current = null;
    return quickCreateStepsFocusTarget(stepsRef.current, removed);
  }, []);
  usePanelModeFocus({
    mode: view,
    home: 'steps',
    formRef,
    returnTarget: stepsReturnTarget,
    enabled: open,
    homeKey: `${flowState.step}:${flowState.dogs.length}`,
  });

  const onSteps = view === 'steps';
  return (
    <SlideOverPanel
      open={open}
      onClose={handlePanelClose}
      title={quickCreateTitle(view, dogSubMode)}
      subtitle={quickCreateStepLabel(flowState.step)}
      size="xl"
      {...(onSteps
        ? {
            headerActions: (
              <Badge variant="outline">{mode === 'single' ? 'Single Dog' : 'Multiple Dogs'}</Badge>
            ),
            footer: (
              <QuickCreateFooter
                flowState={flowState}
                onStepChange={step => setFlowState(prev => ({ ...prev, step }))}
                onCancel={handleClose}
                onComplete={handleCompleteFlow}
              />
            ),
          }
        : { showBackButton: true, onBack: handlePanelClose })}
    >
      {onSteps ? (
        <div ref={stepsRef} tabIndex={-1} className="p-6 outline-none">
          <QuickCreateSteps
            flowState={flowState}
            mode={mode}
            onOpenPersonForm={() => setView('person-form')}
            onOpenDogForm={openDogForm}
            onEditDog={handleEditDog}
            onRemoveDog={handleRemoveDog}
          />
        </div>
      ) : (
        <div ref={formRef} tabIndex={-1} className="h-full outline-none">
          {view === 'person-form' ? (
            <CreateExhibitorDialog
              open
              variant="inline"
              closeRequestRef={closeFormRef}
              onOpenChange={isOpen => !isOpen && showSteps()}
              onExhibitorCreated={handleExhibitorCreated}
              searchQuery={searchQuery}
              offlineFirst={offlineFirst}
              createdFromShowId={createdFromShowId}
            />
          ) : (
            <AddDogPanel
              open
              onClose={showSteps}
              onDogCreated={handleDogCreated}
              userRole={UserRole.SECRETARY}
              currentUserPersonId={flowState.exhibitor?.id}
              variant="inline"
              closeRequestRef={closeFormRef}
              onSubModeChange={setDogSubMode}
              offlineFirst={offlineFirst}
              offlineDependsOn={flowState.exhibitorPendingMutationIds}
              showStartDate={showStartDate}
              createdFromShowId={createdFromShowId}
            />
          )}
        </div>
      )}
    </SlideOverPanel>
  );
};
