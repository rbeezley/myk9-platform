import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { User as UserIcon, CheckCircle, Plus, Info } from 'lucide-react';
import { CreateExhibitorDialog } from './CreateExhibitorDialog';
import { CreateDogDialog } from './CreateDogDialog';
import { User, Dog } from '@/types/dog-types';

interface QuickCreateFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFlowCompleted: (exhibitor: User, dogs: Dog[]) => void;
  searchQuery?: string; // Pre-fill from search if provided
  mode?: 'single' | 'batch'; // Single dog or multiple dogs
}

interface FlowState {
  step: 'exhibitor' | 'dogs' | 'review';
  exhibitor: User | null;
  dogs: Dog[];
  isComplete: boolean;
}

const INITIAL_FLOW_STATE: FlowState = {
  step: 'exhibitor',
  exhibitor: null,
  dogs: [],
  isComplete: false
};

export const QuickCreateFlow: React.FC<QuickCreateFlowProps> = ({
  open,
  onOpenChange,
  onFlowCompleted,
  searchQuery = '',
  mode = 'single'
}) => {
  const [flowState, setFlowState] = useState<FlowState>(INITIAL_FLOW_STATE);
  const [showExhibitorDialog, setShowExhibitorDialog] = useState(false);
  const [showDogDialog, setShowDogDialog] = useState(false);
  const [editingDogIndex, setEditingDogIndex] = useState<number | null>(null);

  // Calculate progress
  const getProgress = (): number => {
    if (flowState.step === 'exhibitor') return 25;
    if (flowState.step === 'dogs') return 65;
    if (flowState.step === 'review') return 90;
    return 100;
  };

  // Handle exhibitor creation
  const handleExhibitorCreated = (exhibitor: User) => {
    setFlowState(prev => ({
      ...prev,
      exhibitor,
      step: 'dogs'
    }));
    setShowExhibitorDialog(false);
  };

  // Handle dog creation
  const handleDogCreated = (dog: Dog) => {
    if (editingDogIndex !== null) {
      // Editing existing dog
      setFlowState(prev => ({
        ...prev,
        dogs: prev.dogs.map((d, index) => index === editingDogIndex ? dog : d)
      }));
      setEditingDogIndex(null);
    } else {
      // Adding new dog
      setFlowState(prev => ({
        ...prev,
        dogs: [...prev.dogs, dog]
      }));
    }
    setShowDogDialog(false);

    // Auto-advance to review if we have dogs and in single mode
    if (mode === 'single' && flowState.dogs.length === 0) {
      setFlowState(prev => ({ ...prev, step: 'review' }));
    }
  };

  // Handle dog editing
  const handleEditDog = (index: number) => {
    setEditingDogIndex(index);
    setShowDogDialog(true);
  };

  // Handle dog removal
  const handleRemoveDog = (index: number) => {
    setFlowState(prev => ({
      ...prev,
      dogs: prev.dogs.filter((_, i) => i !== index)
    }));
  };

  // Handle flow completion
  const handleCompleteFlow = () => {
    if (flowState.exhibitor && flowState.dogs.length > 0) {
      // Update exhibitor with dog IDs
      const updatedExhibitor: User = {
        ...flowState.exhibitor,
        dogs: flowState.dogs.map(dog => dog.id)
      };

      onFlowCompleted(updatedExhibitor, flowState.dogs);
      handleClose();
    }
  };

  // Handle dialog close
  const handleClose = () => {
    setFlowState(INITIAL_FLOW_STATE);
    setShowExhibitorDialog(false);
    setShowDogDialog(false);
    setEditingDogIndex(null);
    onOpenChange(false);
  };

  // Open exhibitor dialog when flow starts
  React.useEffect(() => {
    if (open && flowState.step === 'exhibitor' && !flowState.exhibitor) {
      setShowExhibitorDialog(true);
    }
  }, [open, flowState.step, flowState.exhibitor]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserIcon className="h-5 w-5" />
              Quick Registration Setup
              <Badge variant="outline" className="ml-2">
                {mode === 'single' ? 'Single Dog' : 'Multiple Dogs'}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {/* Progress Indicator */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Progress</span>
              <span>{Math.round(getProgress())}%</span>
            </div>
            <Progress value={getProgress()} className="w-full" />
            <div className="flex justify-between text-xs text-gray-500">
              <span className={flowState.step === 'exhibitor' ? 'font-semibold' : ''}>
                Create Exhibitor
              </span>
              <span className={flowState.step === 'dogs' ? 'font-semibold' : ''}>
                Add Dog(s)
              </span>
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
                  <h3 className="text-lg font-semibold">Create New Exhibitor</h3>
                  <p className="text-gray-600">
                    First, let's create the exhibitor profile. This person will own the dog(s) being registered.
                  </p>
                </div>

                {!flowState.exhibitor && (
                  <Button
                    onClick={() => setShowExhibitorDialog(true)}
                    className="flex items-center gap-2"
                  >
                    <UserIcon className="h-4 w-4" />
                    Create Exhibitor Profile
                  </Button>
                )}

                {flowState.exhibitor && (
                  <div className="p-4 border rounded-lg bg-green-50 border-green-200">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="font-semibold text-green-800">Exhibitor Created</span>
                    </div>
                    <p className="text-sm">
                      {flowState.exhibitor.firstName} {flowState.exhibitor.lastName}
                    </p>
                    <p className="text-sm text-gray-600">{flowState.exhibitor.email}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => setShowExhibitorDialog(true)}
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
                  <p className="text-gray-600">
                    Now let's add the dog(s) for {flowState.exhibitor?.firstName} {flowState.exhibitor?.lastName}.
                    {mode === 'batch' ? ' You can add multiple dogs.' : ' Add one dog to continue.'}
                  </p>
                </div>

                {/* Dogs List */}
                {flowState.dogs.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium">Dogs Added ({flowState.dogs.length}):</h4>
                    {flowState.dogs.map((dog, index) => (
                      <div key={dog.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{dog.callName}</span>
                            <Badge variant="outline">{dog.registrations?.[0]?.breed || 'No breed'}</Badge>
                            <Badge variant="secondary">{dog.gender}</Badge>
                          </div>
                          <p className="text-sm text-gray-600">{dog.name}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditDog(index)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveDog(index)}
                            className="text-red-600 hover:text-red-700"
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
                    onClick={() => setShowDogDialog(true)}
                    className="flex items-center gap-2"
                    variant={flowState.dogs.length === 0 ? "default" : "outline"}
                  >
                    <Plus className="h-4 w-4" />
                    {flowState.dogs.length === 0 ? 'Add First Dog' : 'Add Another Dog'}
                  </Button>
                </div>

                {mode === 'batch' && flowState.dogs.length > 0 && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      You can add more dogs or proceed to review. All dogs will be registered for the same exhibitor.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Review Step */}
            {flowState.step === 'review' && (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">Review & Complete</h3>
                  <p className="text-gray-600">
                    Please review the exhibitor and dog information before completing the setup.
                  </p>
                </div>

                {/* Exhibitor Summary */}
                {flowState.exhibitor && (
                  <div className="space-y-3">
                    <h4 className="font-medium flex items-center gap-2">
                      <UserIcon className="h-4 w-4" />
                      Exhibitor Information
                    </h4>
                    <div className="p-4 border rounded-lg bg-gray-50">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="font-medium">
                            {flowState.exhibitor.firstName} {flowState.exhibitor.lastName}
                          </p>
                          <p className="text-sm text-gray-600">{flowState.exhibitor.email}</p>
                          <p className="text-sm text-gray-600">{flowState.exhibitor.phone}</p>
                        </div>
                        <div>
                          {flowState.exhibitor.streetAddress && (
                            <div className="text-sm text-gray-600">
                              <p>{flowState.exhibitor.streetAddress}</p>
                              <p>
                                {flowState.exhibitor.city}, {flowState.exhibitor.state} {flowState.exhibitor.zipCode}
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
                    {flowState.dogs.map((dog) => (
                      <div key={dog.id} className="p-4 border rounded-lg">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{dog.callName}</span>
                              <Badge variant="outline">{dog.registrations?.[0]?.breed || 'No breed'}</Badge>
                              <Badge variant="secondary">{dog.gender}</Badge>
                            </div>
                            <p className="text-sm text-gray-600">Registered Name: {dog.name}</p>
                            <p className="text-sm text-gray-600">
                              Born: {dog.dateOfBirth} (Age: {dog.age})
                            </p>
                            {dog.registrations && dog.registrations.length > 0 && (
                              <p className="text-sm text-gray-600">
                                Registration: {dog.registrations[0].organization} - {dog.registrations[0].registrationNumber}
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
                    Once you complete this setup, the exhibitor and {flowState.dogs.length === 1 ? 'dog' : 'dogs'} will be 
                    added to the system and available for registration.
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex justify-between pt-4 border-t">
            <div>
              {flowState.step !== 'exhibitor' && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (flowState.step === 'dogs') {
                      setFlowState(prev => ({ ...prev, step: 'exhibitor' }));
                    } else if (flowState.step === 'review') {
                      setFlowState(prev => ({ ...prev, step: 'dogs' }));
                    }
                  }}
                >
                  Back
                </Button>
              )}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              
              {flowState.step === 'exhibitor' && flowState.exhibitor && (
                <Button onClick={() => setFlowState(prev => ({ ...prev, step: 'dogs' }))}>
                  Next: Add Dogs
                </Button>
              )}
              
              {flowState.step === 'dogs' && flowState.dogs.length > 0 && (
                <Button onClick={() => setFlowState(prev => ({ ...prev, step: 'review' }))}>
                  Review
                </Button>
              )}
              
              {flowState.step === 'review' && (
                <Button onClick={handleCompleteFlow} className="bg-green-600 hover:bg-green-700">
                  Complete Setup
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Child Dialogs */}
      <CreateExhibitorDialog
        open={showExhibitorDialog}
        onOpenChange={setShowExhibitorDialog}
        onExhibitorCreated={handleExhibitorCreated}
        searchQuery={searchQuery}
      />

      <CreateDogDialog
        open={showDogDialog}
        onOpenChange={setShowDogDialog}
        onDogCreated={handleDogCreated}
        ownerId={flowState.exhibitor?.id}
        ownerInfo={flowState.exhibitor || undefined}
        prefilledData={editingDogIndex !== null ? flowState.dogs[editingDogIndex] as unknown as Parameters<typeof CreateDogDialog>[0]['prefilledData'] : undefined}
      />
    </>
  );
};