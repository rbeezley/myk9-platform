import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, PlusCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dog, Registration } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';
import { useUserStore } from '@/store/userStore';
import { useOptimisticDogs } from '@/hooks/useOptimisticUI';
import { optimisticFormSubmit } from '@/utils/optimisticHelpers';
import { FormSaveIndicator } from '@/components/optimistic/OptimisticUpdateIndicator';
import { useOptimisticNotifications } from '@/utils/optimisticUtils';

import { logger } from '@/services/LoggingService';

interface OptimisticAddDogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDogCreated: (dog: Dog) => void;
  userRole?: UserRole;
  currentUserPersonId?: string;
}

interface DogFormData {
  callName: string;
  gender: 'Male' | 'Female' | '';
  dateOfBirth: string;
  color: string;
  height: string;
  weight: string;
  microchip: string;
  spayedNeutered: boolean;
  ownerId: string;
  registrations: Registration[];
}

const INITIAL_FORM_DATA: DogFormData = {
  callName: '',
  gender: '',
  dateOfBirth: '',
  color: '',
  height: '',
  weight: '',
  microchip: '',
  spayedNeutered: false,
  ownerId: '',
  registrations: []
};

export const OptimisticAddDogDialog: React.FC<OptimisticAddDogDialogProps> = ({
  open,
  onOpenChange,
  onDogCreated,
  userRole,
  currentUserPersonId
}) => {
  void userRole; // Suppress unused variable warning
  void currentUserPersonId; // Suppress unused variable warning
  const [formData, setFormData] = useState<DogFormData>(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { people } = useUserStore();
  const { showSuccess } = useOptimisticNotifications();

  const {
    isProcessing
  } = useOptimisticDogs({
    onSuccess: (_operationId, result) => {
      showSuccess(`Dog "${formData.callName}" created successfully`, {
        showUndo: true,
        undoAction: () => {
          // Implement undo logic
          logger.debug('Undoing dog creation', 'dogs', {});
        }
      });
      onDogCreated(result as Dog);
      handleClose();
    },
    onError: (operationId, error) => {
      void operationId; // Suppress unused variable warning
      const errorMessage = (error as Error)?.message || 'Failed to create dog';
      setErrors([errorMessage]);
      setIsSubmitting(false);
    },
    onRollback: (operationId) => {
      void operationId; // Suppress unused variable warning
      setErrors(['Dog creation was rolled back due to an error']);
      setIsSubmitting(false);
    }
  });

  const validateForm = (data: DogFormData): string[] | null => {
    const validationErrors: string[] = [];

    if (!data.callName.trim()) {
      validationErrors.push('Call name is required');
    }

    if (!data.gender) {
      validationErrors.push('Gender is required');
    }

    if (!data.dateOfBirth) {
      validationErrors.push('Date of birth is required');
    } else {
      const birthDate = new Date(data.dateOfBirth);
      const today = new Date();
      if (birthDate > today) {
        validationErrors.push('Date of birth cannot be in the future');
      }
    }

    if (!data.ownerId) {
      validationErrors.push('Owner is required');
    }

    return validationErrors.length > 0 ? validationErrors : null;
  };

  const handleSubmit = async () => {
    setErrors([]);
    setIsSubmitting(true);

    try {
      const dogId = `dog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const newDog: Dog = {
        id: dogId,
        name: formData.callName || 'Unnamed Dog', // Use callName as name if available
        breed: 'Unknown', // Default breed
        sex: 'male', // Default sex
        callName: formData.callName || undefined,
        gender: formData.gender as 'Male' | 'Female',
        dateOfBirth: formData.dateOfBirth,
        color: formData.color,
        height: formData.height || undefined,
        weight: formData.weight || undefined,
        microchip: formData.microchip || undefined,
        spayedNeutered: formData.spayedNeutered,
        ownerId: formData.ownerId,
        registrations: formData.registrations
      };

      // Apply optimistic update
      await optimisticFormSubmit(
        'dog',
        dogId,
        formData,
        true, // isNew
        async () => {
          // Simulate API call
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Simulate occasional failure for demonstration
          if (Math.random() < 0.1) {
            throw new Error('Network error: Failed to create dog');
          }

          return newDog;
        },
        validateForm
      );

    } catch (error: unknown) {
      setErrors([(error as Error).message || 'Failed to create dog']);
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData(INITIAL_FORM_DATA);
    setErrors([]);
    setIsSubmitting(false);
    onOpenChange(false);
  };

  const updateField = (field: keyof DogFormData, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear errors when user starts typing
    if (errors.length > 0) {
      setErrors([]);
    }
  };

  const ownerOptions = people.map(person => ({
    value: person.id,
    label: `${person.firstName} ${person.lastName}`
  }));

  const canSubmit = formData.callName && formData.gender && formData.dateOfBirth && formData.ownerId;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add New Dog</DialogTitle>
          <DialogDescription>Enter the dog's information to add them to the system</DialogDescription>
        </DialogHeader>

        <div className="relative flex-1 overflow-y-auto pr-2">
          {/* Optimistic UI indicator */}
          {(isProcessing || isSubmitting) && <FormSaveIndicator operationId="dog-create" />}

          <Tabs defaultValue="basic" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Call Name <span className="text-destructive">*</span></Label>
                  <Input
                    value={formData.callName}
                    onChange={(e) => updateField('callName', e.target.value)}
                    placeholder="Enter call name"
                    disabled={isSubmitting || isProcessing}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Gender <span className="text-destructive">*</span></Label>
                  <Select
                    value={formData.gender}
                    onValueChange={(value) => updateField('gender', value)}
                    disabled={isSubmitting || isProcessing}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Date of Birth <span className="text-destructive">*</span></Label>
                  <Input
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => updateField('dateOfBirth', e.target.value)}
                    disabled={isSubmitting || isProcessing}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Color</Label>
                  <Input
                    value={formData.color}
                    onChange={(e) => updateField('color', e.target.value)}
                    placeholder="Enter color/markings"
                    disabled={isSubmitting || isProcessing}
                  />
                </div>

                <div className="col-span-2 space-y-2">
                  <Label>Owner <span className="text-destructive">*</span></Label>
                  <Select
                    value={formData.ownerId}
                    onValueChange={(value) => updateField('ownerId', value)}
                    disabled={isSubmitting || isProcessing}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select owner" />
                    </SelectTrigger>
                    <SelectContent>
                      {ownerOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="details" className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Height (inches)</Label>
                  <Input
                    type="number"
                    value={formData.height}
                    onChange={(e) => updateField('height', e.target.value)}
                    placeholder="Enter height"
                    step="0.1"
                    disabled={isSubmitting || isProcessing}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Weight (lbs)</Label>
                  <Input
                    type="number"
                    value={formData.weight}
                    onChange={(e) => updateField('weight', e.target.value)}
                    placeholder="Enter weight"
                    step="0.1"
                    disabled={isSubmitting || isProcessing}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Microchip</Label>
                  <Input
                    value={formData.microchip}
                    onChange={(e) => updateField('microchip', e.target.value)}
                    placeholder="Enter microchip number"
                    disabled={isSubmitting || isProcessing}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Spayed/Neutered</Label>
                  <div className="flex items-center space-x-2 pt-2">
                    <Checkbox
                      id="spayedNeutered"
                      checked={formData.spayedNeutered}
                      onCheckedChange={(checked) => updateField('spayedNeutered', checked)}
                      disabled={isSubmitting || isProcessing}
                    />
                    <label
                      htmlFor="spayedNeutered"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Yes, this dog is spayed/neutered
                    </label>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Error Display */}
          {errors.length > 0 && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc list-inside space-y-1">
                  {errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Processing indicator */}
          {(isSubmitting || isProcessing) && (
            <Alert className="mt-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                {isSubmitting ? 'Creating dog...' : 'Saving in background...'}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting || isProcessing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting || isProcessing}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <PlusCircle className="w-4 h-4 mr-2" />
                Create Dog
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
