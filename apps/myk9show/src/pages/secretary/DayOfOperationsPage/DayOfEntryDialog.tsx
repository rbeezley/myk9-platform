/**
 * Day-of Entry Dialog
 *
 * Dialog for creating walk-in entries at a show
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import { getUserFriendlyError } from '@/utils/errorMessages';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import {
  createDayOfEntry,
  searchDogs,
  ClassWithCapacity,
} from '@/services/database/day-of-operations';
import type { DogSearchResult, PaymentMethod } from './types';

interface DayOfEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showId: string;
  userId: string | undefined;
  classes: ClassWithCapacity[];
  onSuccess: () => void;
}

export function DayOfEntryDialog({
  open,
  onOpenChange,
  showId,
  userId,
  classes,
  onSuccess,
}: DayOfEntryDialogProps) {
  // Form state
  const [dogSearch, setDogSearch] = useState('');
  const [dogSearchResults, setDogSearchResults] = useState<DogSearchResult[]>([]);
  const [selectedDog, setSelectedDog] = useState<DogSearchResult | null>(null);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [handler, setHandler] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [jumpHeight, setJumpHeight] = useState('');
  const [entryNotes, setEntryNotes] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const resetForm = () => {
    setDogSearch('');
    setDogSearchResults([]);
    setSelectedDog(null);
    setSelectedClasses([]);
    setHandler('');
    setPaymentMethod('cash');
    setJumpHeight('');
    setEntryNotes('');
  };

  const handleDogSearch = async () => {
    if (dogSearch.length < 2) return;
    const { data } = await searchDogs(dogSearch);
    if (data) {
      setDogSearchResults(data);
    }
  };

  const handleSelectDog = (dog: DogSearchResult) => {
    setSelectedDog(dog);
    setDogSearchResults([]);
    if (dog.owner) {
      setHandler(`${dog.owner.first_name || ''} ${dog.owner.last_name || ''}`.trim());
    }
  };

  const toggleClassSelection = (classId: string) => {
    setSelectedClasses(prev =>
      prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]
    );
  };

  const handleCreate = async () => {
    if (!selectedDog || selectedClasses.length === 0 || !handler || !userId) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await createDayOfEntry(
        {
          dogId: selectedDog.id,
          showId,
          classIds: selectedClasses,
          handler,
          paymentMethod,
          ...(jumpHeight ? { jumpHeight } : {}),
          ...(entryNotes ? { notes: entryNotes } : {}),
        },
        userId
      );

      if (error) {
        toast.error(getUserFriendlyError(error));
        return;
      }

      toast.success(
        `Entry created! Armband #${data?.armbandNumber} assigned for ${selectedClasses.length} class(es)`
      );
      onOpenChange(false);
      resetForm();
      onSuccess();
    } finally {
      setIsCreating(false);
    }
  };

  const availableClasses = classes.filter(c => c.available_spots > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Day-of Entry</DialogTitle>
          <DialogDescription>Create a walk-in entry for a dog at this show</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dog Search */}
          <FormField label="Search for Dog" fieldId="dog-search">
            <div className="flex gap-2">
              <Input
                id="dog-search"
                placeholder="Enter dog name..."
                value={dogSearch}
                onChange={e => setDogSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleDogSearch()}
              />
              <Button variant="outline" onClick={handleDogSearch}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {dogSearchResults.length > 0 && !selectedDog && (
              <div className="border rounded-md max-h-40 overflow-y-auto">
                {dogSearchResults.map(dog => (
                  <div
                    key={dog.id}
                    className="p-2 hover:bg-muted cursor-pointer"
                    onClick={() => handleSelectDog(dog)}
                  >
                    <div className="font-medium">{dog.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {dog.call_name && `"${dog.call_name}" - `}
                      {dog.breed}
                      {dog.owner && ` - ${dog.owner.first_name} ${dog.owner.last_name}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {selectedDog && (
              <div className="flex items-center justify-between bg-muted p-2 rounded-md">
                <div>
                  <span className="font-medium">{selectedDog.name}</span>
                  {selectedDog.call_name && (
                    <span className="text-muted-foreground"> "{selectedDog.call_name}"</span>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedDog(null)}>
                  Change
                </Button>
              </div>
            )}
          </FormField>

          {/* Handler */}
          <FormField label="Handler Name" fieldId="handler-name" required>
            <Input
              id="handler-name"
              placeholder="Handler name"
              value={handler}
              onChange={e => setHandler(e.target.value)}
            />
          </FormField>

          {/* Class Selection */}
          <div className="space-y-2">
            <FormField label="Select Classes" fieldId="class-selection" required>
              <div className="border rounded-md max-h-48 overflow-y-auto p-2 space-y-2">
                {availableClasses.map(cls => (
                  <div key={cls.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={cls.id}
                      checked={selectedClasses.includes(cls.id)}
                      onCheckedChange={() => toggleClassSelection(cls.id)}
                    />
                    <label htmlFor={cls.id} className="flex-1 cursor-pointer">
                      {cls.class_number && (
                        <span className="text-muted-foreground mr-1">#{cls.class_number}</span>
                      )}
                      {cls.name}
                      <span className="text-muted-foreground ml-2">
                        ({cls.available_spots} spots available)
                      </span>
                    </label>
                  </div>
                ))}
                {availableClasses.length === 0 && (
                  <div className="text-center text-muted-foreground py-4">
                    No classes with available spots
                  </div>
                )}
              </div>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Payment Method */}
            <FormField label="Payment Method" fieldId="payment-method">
              <Select
                value={paymentMethod}
                onValueChange={v => setPaymentMethod(v as PaymentMethod)}
              >
                <SelectTrigger id="payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="waived">Waived</SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            {/* Jump Height */}
            <FormField label="Jump Height (optional)" fieldId="jump-height">
              <Input
                id="jump-height"
                placeholder="e.g., 20"
                value={jumpHeight}
                onChange={e => setJumpHeight(e.target.value)}
              />
            </FormField>
          </div>

          {/* Notes */}
          <FormField label="Notes (optional)" fieldId="entry-notes">
            <Textarea
              id="entry-notes"
              placeholder="Any special notes..."
              value={entryNotes}
              onChange={e => setEntryNotes(e.target.value)}
            />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating || !selectedDog || selectedClasses.length === 0}
          >
            {isCreating ? 'Creating...' : 'Create Entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
