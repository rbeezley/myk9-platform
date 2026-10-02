import React, { useCallback, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User as UserIcon, AlertTriangle } from 'lucide-react';
import { CreateExhibitorDuplicates } from './CreateExhibitorDuplicates';
import { User } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';
import { createUser } from '@/services/database/users';
import { mapDatabaseToUser } from '@/services/mappers/userMappers';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { friendlySaveError } from '@/utils/friendlySaveError';
import { addedMessage, offlineAwareMessage } from '@/components/panels/edit/panelSaveErrors';
import { useDiscardPrompt } from '@/components/panels/edit/DiscardChangesDialog';
import { useFormValidation } from '@/hooks/useFormValidation';
import { commonValidations } from '@/lib/validation';
import { useUserStore } from '@/store/userStore';
import {
  findLikelyDuplicatePersonCandidate,
  type PersonIdentityCandidate,
} from '@/utils/personIdentity';
import { z } from 'zod';
import { replicatedShowDeskPeopleTable } from '@/services/replication/ReplicatedShowDeskPeopleTable';

interface CreateExhibitorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExhibitorCreated: (
    exhibitor: User,
    metadata?: { pendingMutationIds?: string[] | undefined }
  ) => void;
  onDuplicateSelected?: (existingExhibitor: User) => void;
  searchQuery?: string; // Pre-fill from search if provided
  offlineFirst?: boolean;
}

const exhibitorFormSchema = z.object({
  firstName: z.string().min(1, 'Please enter a first name'),
  lastName: z.string().min(1, 'Please enter a last name'),
  // MYK9-832: a mail-in paper form often carries only a postal address — the
  // backend (createUser / replicatedShowDeskPeopleTable.createPerson) already
  // writes null for either field, so requiring both here only forced a
  // secretary keying that form to invent an email or phone number.
  email: commonValidations.email.optional().or(z.literal('')),
  phone: commonValidations.phone,
  streetAddress: z.string(),
  city: z.string(),
  state: z.string(),
  zipCode: z.string(),
});

type ExhibitorFormData = z.infer<typeof exhibitorFormSchema>;

const INITIAL_FORM_DATA: ExhibitorFormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  streetAddress: '',
  city: '',
  state: '',
  zipCode: '',
};

export const CreateExhibitorDialog: React.FC<CreateExhibitorDialogProps> = ({
  open,
  onOpenChange,
  onExhibitorCreated,
  onDuplicateSelected,
  searchQuery = '',
  offlineFirst = false,
}) => {
  const form = useFormValidation(exhibitorFormSchema, INITIAL_FORM_DATA);
  const { people, loadUsers } = useUserStore();
  const [duplicates, setDuplicates] = useState<PersonIdentityCandidate[]>([]);
  const [activeTab, setActiveTab] = useState<'create' | 'duplicates'>('create');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Initialize form with search query if provided
  const resetForm = form.reset;
  React.useEffect(() => {
    if (searchQuery && open) {
      // Try to parse search query for name parts
      const parts = searchQuery.split(' ');
      if (parts.length >= 2) {
        resetForm({
          ...INITIAL_FORM_DATA,
          firstName: parts[0],
          lastName: parts.slice(1).join(' '),
        });
      } else {
        resetForm({
          ...INITIAL_FORM_DATA,
          lastName: searchQuery,
        });
      }
    }
  }, [searchQuery, open, resetForm]);

  React.useEffect(() => {
    if (open && people.length === 0) {
      loadUsers();
    }
  }, [loadUsers, open, people.length]);

  // Duplicate detection logic
  const detectDuplicates = useCallback(
    (data: ExhibitorFormData): PersonIdentityCandidate[] => {
      const candidate = findLikelyDuplicatePersonCandidate(people, {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        streetAddress: data.streetAddress,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
      });

      return candidate ? [candidate] : [];
    },
    [people]
  );

  React.useEffect(() => {
    if (!open) return;

    const hasSearchableIdentity =
      (form.data.email ?? '').includes('@') ||
      (form.data.firstName.trim().length >= 2 && form.data.lastName.trim().length >= 2) ||
      (form.data.phone ?? '').trim().length >= 7;

    if (!hasSearchableIdentity) return;

    const newDuplicates = detectDuplicates(form.data);
    setDuplicates(newDuplicates);
    if (newDuplicates.length > 0) {
      setActiveTab('duplicates');
    }
  }, [detectDuplicates, form.data, open, people]);

  // Handle form field changes
  const handleFieldChange = (field: keyof ExhibitorFormData, value: string) => {
    setCreateError(null);
    form.setValue(field, value);
    form.touchField(field);

    // Re-run duplicate detection on key fields
    if (['firstName', 'lastName', 'email', 'phone'].includes(field)) {
      const updatedData = { ...form.data, [field]: value };
      const newDuplicates = detectDuplicates(updatedData);
      setDuplicates(newDuplicates);

      // Switch to duplicates tab if we found potential matches
      if (newDuplicates.length > 0) {
        setActiveTab('duplicates');
      }
    }
  };

  const confirmAdded = (data: ExhibitorFormData) =>
    notifications.success(
      offlineAwareMessage(addedMessage(`${data.firstName} ${data.lastName}`.trim(), 'Person'))
    );

  // Handle form submission
  const handleSubmit = form.handleSubmit(async (validatedData: ExhibitorFormData) => {
    setIsCreating(true);
    setCreateError(null);
    try {
      if (offlineFirst) {
        const person = await replicatedShowDeskPeopleTable.createPerson({
          firstName: validatedData.firstName,
          lastName: validatedData.lastName,
          email: validatedData.email || null,
          phone: validatedData.phone || null,
          address: validatedData.streetAddress || null,
          city: validatedData.city || null,
          state: validatedData.state || null,
          zipCode: validatedData.zipCode || null,
        });

        const newExhibitor: User = {
          id: person.id,
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email ?? '',
          phone: person.phone ?? '',
          streetAddress: person.address ?? undefined,
          city: person.city ?? undefined,
          state: person.state ?? undefined,
          zipCode: person.zipCode ?? undefined,
          roles: [UserRole.EXHIBITOR],
          dogs: [],
          associatedDogs: [],
        };

        const pendingMutationIds = await replicatedShowDeskPeopleTable.getPendingMutationIdsForRow(
          person.id
        );
        onExhibitorCreated(newExhibitor, {
          pendingMutationIds,
        });
        confirmAdded(validatedData);
        handleClose();
        return;
      }

      const { data, error } = await createUser({
        first_name: validatedData.firstName,
        last_name: validatedData.lastName,
        email: validatedData.email || null,
        phone: validatedData.phone || null,
        street_address: validatedData.streetAddress || null,
        city: validatedData.city || null,
        state: validatedData.state || null,
        zip_code: validatedData.zipCode || null,
      });

      if (error || !data) {
        // The original error, not a copy: its SQLSTATE is what tells a duplicate
        // email from an outage.
        throw error ?? new Error('Unable to add person.');
      }

      const newExhibitor: User = {
        ...mapDatabaseToUser(data as Record<string, unknown>),
        roles: [UserRole.EXHIBITOR],
        dogs: [],
        associatedDogs: [],
      };

      onExhibitorCreated(newExhibitor);
      confirmAdded(validatedData);
      handleClose();
    } catch (error) {
      logger.error('Error creating exhibitor:', 'shows', {}, error as Error);
      // Friendly copy only: the raw message can carry database text (H1). The
      // form stays open with everything the secretary typed.
      setCreateError(friendlySaveError(error).description);
    } finally {
      setIsCreating(false);
    }
  });

  // Handle dialog close
  const handleClose = () => {
    form.reset(INITIAL_FORM_DATA);
    setDuplicates([]);
    setActiveTab('create');
    setCreateError(null);
    onOpenChange(false);
  };

  // Cancel, Escape and the overlay all ask first when the form holds typed
  // details (H15). Closing after a save or picking a duplicate calls
  // handleClose directly: nothing is lost there.
  const { requestClose, discardDialog } = useDiscardPrompt({
    isDirty: form.hasChanges,
    close: handleClose,
    blocked: isCreating,
  });

  // Handle selecting existing duplicate
  const handleSelectDuplicate = (candidate: PersonIdentityCandidate) => {
    onDuplicateSelected?.(candidate.person);
    handleClose();
  };

  // Pre-compute visible errors
  const firstNameError = form.getError('firstName');
  const lastNameError = form.getError('lastName');
  const emailError = form.getError('email');
  const phoneError = form.getError('phone');

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={isOpen => {
          if (isOpen) onOpenChange(true);
          else requestClose();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserIcon className="h-5 w-5" />
              Add Person
            </DialogTitle>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={value => setActiveTab(value as 'create' | 'duplicates')}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="create" className="flex items-center gap-2">
                <UserIcon className="h-4 w-4" />
                New Person
              </TabsTrigger>
              <TabsTrigger value="duplicates" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Possible Duplicates
                {duplicates.length > 0 && (
                  <Badge variant="destructive" className="ml-1">
                    {duplicates.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="create" className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="First Name" fieldId="firstName" required error={firstNameError}>
                  <Input
                    id="firstName"
                    value={form.data.firstName}
                    onChange={e => handleFieldChange('firstName', e.target.value)}
                    placeholder="Enter first name"
                    {...form.getFieldProps('firstName')}
                  />
                </FormField>

                <FormField label="Last Name" fieldId="lastName" required error={lastNameError}>
                  <Input
                    id="lastName"
                    value={form.data.lastName}
                    onChange={e => handleFieldChange('lastName', e.target.value)}
                    placeholder="Enter last name"
                    {...form.getFieldProps('lastName')}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Email Address" fieldId="email" error={emailError}>
                  <Input
                    id="email"
                    type="email"
                    value={form.data.email}
                    onChange={e => handleFieldChange('email', e.target.value)}
                    placeholder="Enter email address (optional)"
                    {...form.getFieldProps('email')}
                  />
                </FormField>

                <FormField label="Phone Number" fieldId="phone" error={phoneError}>
                  <Input
                    id="phone"
                    value={form.data.phone}
                    onChange={e => handleFieldChange('phone', e.target.value)}
                    placeholder="Enter phone number (optional)"
                    {...form.getFieldProps('phone')}
                  />
                </FormField>
              </div>

              <FormField label="Street Address" fieldId="streetAddress">
                <Input
                  id="streetAddress"
                  value={form.data.streetAddress}
                  onChange={e => handleFieldChange('streetAddress', e.target.value)}
                  placeholder="Enter street address"
                />
              </FormField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField label="City" fieldId="city">
                  <Input
                    id="city"
                    value={form.data.city}
                    onChange={e => handleFieldChange('city', e.target.value)}
                    placeholder="Enter city"
                  />
                </FormField>

                <FormField label="State" fieldId="state">
                  <Input
                    id="state"
                    value={form.data.state}
                    onChange={e => handleFieldChange('state', e.target.value)}
                    placeholder="State"
                  />
                </FormField>

                <FormField label="ZIP Code" fieldId="zipCode">
                  <Input
                    id="zipCode"
                    value={form.data.zipCode}
                    onChange={e => handleFieldChange('zipCode', e.target.value)}
                    placeholder="ZIP"
                  />
                </FormField>
              </div>

              {duplicates.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    We found {duplicates.length} potential duplicate(s). Please check the "Possible
                    Duplicates" tab to ensure you're not adding a duplicate person.
                  </AlertDescription>
                </Alert>
              )}

              {createError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{createError}</AlertDescription>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="duplicates" className="space-y-4">
              <CreateExhibitorDuplicates
                duplicates={duplicates}
                onSelect={handleSelectDuplicate}
                onAddAnyway={() => setActiveTab('create')}
              />
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={requestClose} disabled={isCreating}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isCreating || activeTab === 'duplicates'}
              className="min-w-[100px]"
            >
              {isCreating ? 'Saving...' : 'Add Person'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {discardDialog}
    </>
  );
};
