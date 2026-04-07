/**
 * Onboarding Step 2 - Add Your Dogs
 * Allows adding multiple dogs inline. Skippable.
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';

export interface DogEntry {
  id: string;
  callName: string;
  registeredName: string;
  breed: string;
  registrationNumber: string;
}

interface StepDogsProps {
  dogs: DogEntry[];
  onChange: (dogs: DogEntry[]) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

function createEmptyDog(): DogEntry {
  return {
    id: crypto.randomUUID(),
    callName: '',
    registeredName: '',
    breed: '',
    registrationNumber: '',
  };
}

export function StepDogs({ dogs, onChange, onNext, onBack, onSkip }: StepDogsProps) {
  const addDog = () => onChange([...dogs, createEmptyDog()]);

  const removeDog = (id: string) => onChange(dogs.filter(d => d.id !== id));

  const updateDog = (id: string, field: keyof DogEntry, value: string) => {
    onChange(dogs.map(d => (d.id === id ? { ...d, [field]: value } : d)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="step-dogs">
      <div>
        <h2 className="text-xl font-semibold">Add your dogs</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Add the dogs you compete with. You can always add more from your profile later.
        </p>
      </div>

      {dogs.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">No dogs added yet.</p>
          <Button type="button" variant="outline" size="sm" onClick={addDog}>
            <Plus className="h-4 w-4 mr-1" />
            Add a dog
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {dogs.map((dog, index) => (
            <div
              key={dog.id}
              className="rounded-md border p-4 space-y-3 relative"
              data-testid={`dog-entry-${index}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Dog {index + 1}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeDog(dog.id)}
                  aria-label={`Remove dog ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor={`dog-callName-${dog.id}`}>Call name *</Label>
                  <Input
                    id={`dog-callName-${dog.id}`}
                    value={dog.callName}
                    onChange={e => updateDog(dog.id, 'callName', e.target.value)}
                    placeholder="Buddy"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`dog-breed-${dog.id}`}>Breed *</Label>
                  <Input
                    id={`dog-breed-${dog.id}`}
                    value={dog.breed}
                    onChange={e => updateDog(dog.id, 'breed', e.target.value)}
                    placeholder="Border Collie"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor={`dog-registeredName-${dog.id}`}>Registered name (optional)</Label>
                <Input
                  id={`dog-registeredName-${dog.id}`}
                  value={dog.registeredName}
                  onChange={e => updateDog(dog.id, 'registeredName', e.target.value)}
                  placeholder="CH Border's Best Buddy"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`dog-regNum-${dog.id}`}>AKC / org reg number (optional)</Label>
                <Input
                  id={`dog-regNum-${dog.id}`}
                  value={dog.registrationNumber}
                  onChange={e => updateDog(dog.id, 'registrationNumber', e.target.value)}
                  placeholder="AKC DN12345678"
                />
              </div>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={addDog}>
            <Plus className="h-4 w-4 mr-1" />
            Add another dog
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
          <Button type="submit" disabled={dogs.length === 0}>
            Next
          </Button>
        </div>
      </div>
    </form>
  );
}
