import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { GroupedSearchablePopover } from '@/components/ui/grouped-searchable-popover';
import { groupPeopleForOfficial, getPersonName } from './ShowDetailsStep.helpers';
import { UserRole } from '@/types/auth-types';
import type { User } from '@/types/user-types';

interface CreatePersonData {
  firstName: string;
  lastName: string;
  email: string;
}

export interface OfficialPickerProps {
  label: string;
  required?: boolean;
  selectedPersonId: string | undefined;
  people: User[];
  suggestedRoles: UserRole[];
  autoFillBadge?: string;
  onSelect: (personId: string) => void;
  onCreatePerson: (data: CreatePersonData) => Promise<string>;
}

export const OfficialPicker: React.FC<OfficialPickerProps> = ({
  label,
  required = false,
  selectedPersonId,
  people,
  suggestedRoles,
  autoFillBadge,
  onSelect,
  onCreatePerson,
}) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const selectedName = getPersonName(people, selectedPersonId);
  const { suggested, others } = groupPeopleForOfficial(people, suggestedRoles, searchTerm);

  const handleOpenAddNew = () => {
    setOpen(false);
    setShowCreateForm(true);
  };

  const handleCancelCreate = () => {
    setShowCreateForm(false);
    setFirstName('');
    setLastName('');
    setEmail('');
    setSaveError(null);
  };

  const handleSaveCreate = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const newId = await onCreatePerson({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
      });
      onSelect(newId);
      handleCancelCreate();
    } catch {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const canSave = firstName.trim() !== '' && lastName.trim() !== '' && email.trim() !== '';

  const renderPersonRow = (person: User) => (
    <div className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">
          {person.firstName} {person.lastName}
        </span>
      </div>
      {person.email && <div className="text-xs text-muted-foreground">{person.email}</div>}
    </div>
  );

  return (
    <div className="space-y-2">
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>

      {!showCreateForm && (
        <GroupedSearchablePopover<User>
          open={open}
          onOpenChange={setOpen}
          triggerLabel={selectedName ?? `Select ${label}`}
          searchPlaceholder={`Search ${label.toLowerCase()}…`}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          groups={[
            { groupKey: 'suggested', label: 'Suggested', items: suggested },
            { groupKey: 'all', label: 'All People', items: others },
          ]}
          renderItem={renderPersonRow}
          onSelect={person => onSelect(person.id)}
          footer={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground hover:text-primary"
              onClick={handleOpenAddNew}
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add new {label}
            </Button>
          }
        />
      )}

      {autoFillBadge && selectedName && !showCreateForm && (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 text-indigo-400 border-indigo-400/30"
        >
          {autoFillBadge}
        </Badge>
      )}

      {showCreateForm && (
        <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
          <p className="text-sm font-semibold">New {label}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">First name *</Label>
              <Input
                placeholder="First name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Last name *</Label>
              <Input
                placeholder="Last name"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email *</Label>
            <Input
              placeholder="email@example.com"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          {saveError && <p className="text-xs text-destructive">{saveError}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleCancelCreate}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canSave || saving}
              onClick={handleSaveCreate}
            >
              Add {label}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
