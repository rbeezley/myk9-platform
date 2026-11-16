/**
 * Adds one Event Committee member: a person on myK9Show, or a typed name for someone who is not.
 * The same picker as the Assign Officer dialog; a member has no position, only an order.
 */

import { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { filterPeoplePicker } from '@/pages/club-admin/peoplePickerFilter';
import type { User } from '@/types/user-types';
import type { CommitteeTarget } from '@/types/committee-types';

interface CommitteeMemberDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (target: CommitteeTarget) => void;
  people: User[];
  isSaving: boolean;
}

export function CommitteeMemberDialog({
  open,
  onClose,
  onSave,
  people,
  isSaving,
}: CommitteeMemberDialogProps) {
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [search, setSearch] = useState('');
  const [typedName, setTypedName] = useState('');

  const picker = useMemo(() => filterPeoplePicker(search, people), [people, search]);
  const trimmedTypedName = typedName.trim();
  const canSave = Boolean(selectedPersonId || trimmedTypedName);

  const reset = () => {
    setSelectedPersonId('');
    setSearch('');
    setTypedName('');
  };

  const handleSave = () => {
    if (!canSave) return;
    // A picked person wins; the typed name is only for someone with no account.
    onSave(selectedPersonId ? { personId: selectedPersonId } : { displayName: trimmedTypedName });
    reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={next => !next && handleClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <div className="flex items-center gap-3 pb-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle className="text-lg font-semibold text-foreground">
            Add committee member
          </DialogTitle>
        </div>
        <div className="space-y-4 pt-2">
          <FormField label="Person" fieldId="committee-search">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="committee-search"
                placeholder="Search people by name or email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 border-border"
              />
            </div>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-[color:var(--chip-stone-bg)]">
              {picker.people.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground text-center">{picker.hint}</p>
              ) : (
                picker.people.map(person => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => {
                      setSelectedPersonId(person.id);
                      setTypedName('');
                    }}
                    className={`w-full text-left px-3 py-2 text-sm min-h-11 transition-colors ${
                      selectedPersonId === person.id
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-card text-foreground'
                    }`}
                  >
                    <span className="font-medium">
                      {person.firstName} {person.lastName}
                    </span>
                    {person.email && (
                      <span className="text-muted-foreground ml-2 text-xs">{person.email}</span>
                    )}
                  </button>
                ))
              )}
            </div>
            {picker.people.length > 0 && picker.hint && (
              <p className="mt-1 text-sm text-muted-foreground">{picker.hint}</p>
            )}
          </FormField>

          {/* Someone with no account: the list prints their name; they get no access. */}
          <FormField label="Not on myK9Show? Type their name" fieldId="committee-typed-name">
            <Input
              id="committee-typed-name"
              placeholder="Full name"
              maxLength={120}
              value={typedName}
              onChange={e => {
                setTypedName(e.target.value);
                if (e.target.value) setSelectedPersonId('');
              }}
              className="border-border"
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose} className="border-border">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!canSave || isSaving}>
              {isSaving ? 'Adding...' : 'Add member'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
