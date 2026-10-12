/**
 * The registration form an unsaved dog's registrations are edited with: its
 * fields and footer, driven by `useRegistrationEditor` (MYK9-1081). It writes an in-memory
 * `Registration` through `onSave`, never the database, so it is not
 * interchangeable with DogDetails' AddRegistrationPanel / EditRegistrationPanel.
 *
 * Two containers render it: `AddEditRegistrationDialog` (its own slide-out, for
 * a page that opens it directly) and Add Dog's inline registration sub-mode
 * (inside a host panel, never stacked on it).
 */
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import { SearchablePopover } from '@/components/ui/searchable-popover';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { registrationNameHint } from './registrationNameHint';
import { REGISTRATION_ORGS, type RegistrationEditor } from './useRegistrationEditor';

/** Cancel and Save Registration. */
export const RegistrationFormFooter: React.FC<{
  editor: RegistrationEditor;
  onCancel: () => void;
}> = ({ editor: { isSaving, handleSubmit }, onCancel }) => (
  <div className="flex items-center justify-end gap-2">
    <Button variant="outline" onClick={onCancel} disabled={isSaving}>
      Cancel
    </Button>
    <Button onClick={handleSubmit} disabled={isSaving} aria-busy={isSaving}>
      Save Registration
    </Button>
  </div>
);

/** The registration fields, padded for a panel body. */
export const RegistrationFormBody: React.FC<{ editor: RegistrationEditor }> = ({ editor }) => {
  const {
    form,
    organizationError,
    breedError,
    availableVarieties,
    filteredBreeds,
    breedPickerOpen,
    setBreedPickerOpen,
    breedSearch,
    setBreedSearch,
    handleFieldChange,
    handleOrganizationChange,
    handleBreedChange,
  } = editor;
  return (
    <div className="space-y-4 p-6">
      <FormField
        label="Registration Organization"
        fieldId="organization"
        required
        error={organizationError}
      >
        <Select value={form.data.organization} onValueChange={handleOrganizationChange}>
          <SelectTrigger
            id="organization"
            aria-invalid={!!organizationError}
            aria-describedby={organizationError ? 'organization-error' : undefined}
          >
            <SelectValue placeholder="Select organization" />
          </SelectTrigger>
          <SelectContent>
            {REGISTRATION_ORGS.map(org => (
              <SelectItem key={org} value={org}>
                {org}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        label="Registered Name"
        fieldId="registeredName"
        required
        error={form.getError('registeredName')}
        hint={registrationNameHint}
        hintClassName="text-base"
      >
        <Input
          id="registeredName"
          value={form.data.registeredName}
          onChange={e => handleFieldChange('registeredName', e.target.value)}
          placeholder="Full registered name"
          {...form.getFieldProps('registeredName')}
          aria-describedby={`registeredName-hint${form.getError('registeredName') ? ' registeredName-error' : ''}`}
        />
      </FormField>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Registered Breed" fieldId="breed" required error={breedError}>
          {form.data.organization ? (
            <SearchablePopover
              id="breed"
              aria-invalid={!!breedError}
              aria-describedby={breedError ? 'breed-error' : undefined}
              open={breedPickerOpen}
              onOpenChange={next => {
                setBreedPickerOpen(next);
                if (!next) setBreedSearch('');
              }}
              triggerLabel={form.data.breed || 'Select breed'}
              searchPlaceholder="Search breeds…"
              searchTerm={breedSearch}
              onSearchChange={setBreedSearch}
              items={filteredBreeds}
              emptyMessage="No breeds match your search"
              listboxLabel="Breeds"
              selectedItemIds={form.data.breed ? [form.data.breed] : []}
              onSelect={breed => {
                handleBreedChange(breed.id);
                setBreedSearch('');
              }}
              renderItem={breed => (
                <div
                  className={cn(
                    'flex w-full items-center justify-between gap-2 p-3 text-left text-sm hover:bg-muted border-b last:border-b-0',
                    breed.id === form.data.breed && 'bg-muted/60 font-medium'
                  )}
                >
                  {breed.id}
                  {breed.id === form.data.breed && <Check className="h-4 w-4 text-primary" />}
                </div>
              )}
            />
          ) : (
            <Button
              id="breed"
              type="button"
              variant="outline"
              disabled
              className="w-full justify-start text-muted-foreground"
            >
              Select organization first
            </Button>
          )}
        </FormField>

        <FormField label="Variety" fieldId="variety">
          {availableVarieties.length > 0 ? (
            <Select
              value={form.data.variety || ''}
              onValueChange={value => handleFieldChange('variety', value)}
            >
              <SelectTrigger id="variety">
                <SelectValue placeholder="Select variety" />
              </SelectTrigger>
              <SelectContent>
                {availableVarieties.map(variety => (
                  <SelectItem key={variety} value={variety}>
                    {variety}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="variety"
              value={form.data.variety || ''}
              onChange={e => handleFieldChange('variety', e.target.value)}
              placeholder={form.data.breed ? 'No varieties for this breed' : 'Select breed first'}
              disabled={!form.data.breed}
            />
          )}
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="Registration Number"
          fieldId="registrationNumber"
          required
          error={form.getError('registrationNumber')}
        >
          {/* User testing: nothing signalled that the organization must be
                chosen first, so exhibitors typed a number into a field whose
                format depends on a registry they hadn't picked yet. Gate it
                the same way the breed picker above is gated — one consistent
                "organization first" rule across the whole form, stated in the
                placeholder rather than only discovered on validation. */}
          <Input
            id="registrationNumber"
            value={form.data.registrationNumber}
            onChange={e => handleFieldChange('registrationNumber', e.target.value)}
            placeholder={
              form.data.organization ? 'Enter registration number' : 'Select organization first'
            }
            disabled={!form.data.organization}
            {...form.getFieldProps('registrationNumber')}
          />
        </FormField>

        <FormField label="Status" fieldId="registrationStatus">
          <Select
            value={form.data.status}
            onValueChange={value => handleFieldChange('status', value)}
          >
            <SelectTrigger id="registrationStatus">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Expired">Expired</SelectItem>
              <SelectItem value="Under review">Under review</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>
    </div>
  );
};
