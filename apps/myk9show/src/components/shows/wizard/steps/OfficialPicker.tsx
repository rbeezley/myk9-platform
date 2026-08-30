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

export interface CreatePersonData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface OfficialPickerProps {
  label: string;
  required?: boolean;
  selectedPersonId: string | undefined;
  people: User[];
  suggestedRoles: UserRole[];
  autoFillBadge?: string;
  /**
   * People who cannot be selected here — e.g. the person already chosen as the
   * other official. A Chairman and Secretary must be different people.
   */
  excludePersonIds?: string[];
  /** True while the people list is still being fetched. */
  loading?: boolean;
  /**
   * Person ids in the show's host club, surfaced as their own group (F8). Optional:
   * with none supplied the picker behaves exactly as before, so callers that have no
   * club context are unaffected.
   */
  clubMemberIds?: readonly string[];
  /** Club name for the group heading, e.g. "Heartland Scent Work Club members". */
  clubName?: string | undefined;
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
  excludePersonIds = [],
  loading = false,
  clubMemberIds = [],
  clubName,
  onSelect,
  onCreatePerson,
}) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const selectedName = getPersonName(people, selectedPersonId);
  const { members, suggested, others } = groupPeopleForOfficial(
    people,
    suggestedRoles,
    searchTerm,
    excludePersonIds,
    clubMemberIds
  );

  const handleOpenAddNew = () => {
    setOpen(false);
    setShowCreateForm(true);
  };

  const handleCancelCreate = () => {
    setShowCreateForm(false);
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setSaveError(null);
  };

  const handleSaveCreate = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const newId = await onCreatePerson({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
      });
      onSelect(newId);
      handleCancelCreate();
    } catch {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    firstName.trim() !== '' &&
    lastName.trim() !== '' &&
    email.trim() !== '' &&
    phone.trim() !== '';

  // Slug derived from `label` so two OfficialPickers on the same page (e.g.
  // "Show Chairman" + "Show Secretary") don't collide on element ids.
  const idSlug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const triggerId = `official-${idSlug}-trigger`;
  const firstNameId = `official-${idSlug}-first-name`;
  const lastNameId = `official-${idSlug}-last-name`;
  const emailId = `official-${idSlug}-email`;
  const phoneId = `official-${idSlug}-phone`;

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
      <Label htmlFor={triggerId}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>

      {!showCreateForm && (
        <GroupedSearchablePopover<User>
          id={triggerId}
          open={open}
          onOpenChange={setOpen}
          triggerLabel={selectedName ?? `Select ${label}`}
          searchPlaceholder={`Search ${label.toLowerCase()}…`}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          loading={loading}
          loadingLabel="Loading people…"
          // Club members first: for a club's own show, "someone this club knows" is
          // the more useful cut than a platform-wide role hint. Empty groups are
          // dropped so a picker with no club context looks exactly as it did.
          groups={[
            {
              groupKey: 'members',
              label: clubName ? `${clubName} members` : 'Club members',
              items: members,
            },
            { groupKey: 'suggested', label: 'Suggested', items: suggested },
            { groupKey: 'all', label: 'All People', items: others },
          ].filter(group => group.items.length > 0)}
          renderItem={renderPersonRow}
          selectedItemIds={selectedPersonId ? [selectedPersonId] : []}
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
          className="text-xs px-1.5 py-0 text-info border-info/30"
        >
          {autoFillBadge}
        </Badge>
      )}

      {showCreateForm && (
        <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
          <p className="text-sm font-semibold">New {label}</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={firstNameId} className="text-xs">
                First name *
              </Label>
              <Input
                id={firstNameId}
                placeholder="First name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={lastNameId} className="text-xs">
                Last name *
              </Label>
              <Input
                id={lastNameId}
                placeholder="Last name"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor={emailId} className="text-xs">
              Email *
            </Label>
            <Input
              id={emailId}
              placeholder="email@example.com"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={phoneId} className="text-xs">
              Phone *
            </Label>
            <Input
              id={phoneId}
              placeholder="(555) 123-4567"
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          {saveError && <p className="text-xs text-destructive">{saveError}</p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancelCreate}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canSave || saving}
              onClick={handleSaveCreate}
              className="w-full sm:w-auto"
            >
              Add {label}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
