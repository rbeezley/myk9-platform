import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSearchPeople } from '@/hooks/queries/volunteerQueries';
import { useDebounce } from '@/hooks/performance/useTimingHooks';
import type { Volunteer } from '@/types/volunteer';

interface VolunteerFormData {
  name: string;
  phone: string | null;
  notes: string | null;
  personId: string | null;
}

interface VolunteerDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: VolunteerFormData) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  volunteer: Volunteer | null;
}

export function VolunteerDialog({
  open,
  onClose,
  onSave,
  onDelete,
  volunteer,
}: VolunteerDialogProps) {
  const isEditing = volunteer !== null;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [personId, setPersonId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // People search for linking to registered users
  const [peopleQuery, setPeopleQuery] = useState('');
  const debouncedQuery = useDebounce(peopleQuery, 300);
  const { data: searchResults = [] } = useSearchPeople(debouncedQuery);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (open) {
      setName(volunteer?.name ?? '');
      setPhone(volunteer?.phone ?? '');
      setNotes(volunteer?.notes ?? '');
      setPersonId(volunteer?.personId ?? null);
      setPeopleQuery('');
      setShowSuggestions(false);
    }
  }, [open, volunteer]);

  function handleSelectPerson(person: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
  }) {
    setName(`${person.firstName} ${person.lastName}`.trim());
    setPhone(person.phone ?? '');
    setPersonId(person.id);
    setPeopleQuery('');
    setShowSuggestions(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        phone: phone.trim() || null,
        notes: notes.trim() || null,
        personId,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!volunteer || !onDelete) return;
    setSaving(true);
    try {
      await onDelete(volunteer.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={val => !val && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Volunteer' : 'Add Volunteer'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* People search — link to registered user (add mode only) */}
          {!isEditing && (
            <div className="space-y-2">
              <Label htmlFor="vol-search">Search Registered Users</Label>
              <div className="relative">
                <Input
                  id="vol-search"
                  value={peopleQuery}
                  onChange={e => {
                    setPeopleQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  placeholder="Type to search... (optional)"
                />
                {showSuggestions && searchResults.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                    {searchResults.map(person => (
                      <button
                        key={person.id}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => handleSelectPerson(person)}
                      >
                        {person.firstName} {person.lastName}
                        {person.phone && (
                          <span className="ml-2 text-muted-foreground">{person.phone}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {personId ? 'Linked to registered user' : 'Skip to add as walk-up volunteer'}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="vol-name">Name</Label>
            <Input
              id="vol-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Full name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vol-phone">Phone</Label>
            <Input
              id="vol-phone"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vol-notes">Notes</Label>
            <Textarea
              id="vol-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Availability, skills, etc."
              rows={3}
            />
          </div>
          <DialogFooter className="flex justify-between">
            <div>
              {isEditing && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={saving}
                >
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                Save
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
