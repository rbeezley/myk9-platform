/**
 * Onboarding Step 2 — Add Your Dogs
 *
 * Uses the existing AddDogPanel (full org + breed + registration flow)
 * rather than a parallel inline form. Dogs are saved to the DB immediately
 * when created; the list auto-refreshes via useDogsQuery.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PawPrint, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddDogPanel } from '@/components/panels/edit/AddDogPanel';
import { supabase } from '@/lib/supabase';
import { UserRole } from '@/types/auth-types';

interface StepDogsProps {
  personId: string;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

// Intentionally bypasses useDogsQuery (which returns ALL dogs for site_admin).
// In onboarding we only ever show the current user's own dogs.
function useMyDogs(personId: string) {
  return useQuery({
    queryKey: ['onboarding-dogs', personId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dogs')
        .select('id, name, call_name, breed, registrations:dog_registrations(organization, breed)')
        .eq('owner_id', personId)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(personId),
  });
}

export function StepDogs({ personId, onNext, onBack, onSkip }: StepDogsProps) {
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const { data: dogs = [], isLoading, refetch } = useMyDogs(personId);

  const handleDogCreated = () => {
    setAddPanelOpen(false);
    refetch();
  };

  return (
    <div className="space-y-4" data-testid="step-dogs">
      <div>
        <h2 className="text-xl font-semibold">Add your dogs</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Add the dogs you compete with. You can always add more from your profile later.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
      ) : dogs.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center space-y-3">
          <PawPrint className="h-8 w-8 mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No dogs added yet.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setAddPanelOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add a dog
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {dogs.map(dog => (
            <div key={dog.id} className="flex items-center gap-3 rounded-md border px-4 py-3">
              <PawPrint className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{dog.call_name || dog.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {dog.registrations?.[0]?.breed ?? dog.breed}
                  {dog.registrations?.[0]?.organization
                    ? ` · ${dog.registrations[0].organization}`
                    : ''}
                </p>
              </div>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={() => setAddPanelOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add another dog
          </Button>
        </div>
      )}

      <AddDogPanel
        open={addPanelOpen}
        onClose={() => setAddPanelOpen(false)}
        onDogCreated={handleDogCreated}
        userRole={UserRole.EXHIBITOR}
        currentUserPersonId={personId}
      />

      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
          <Button type="button" onClick={onNext}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
