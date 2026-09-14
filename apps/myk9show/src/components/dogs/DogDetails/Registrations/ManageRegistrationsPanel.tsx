/**
 * The exhibitor's registration editing surface, as a panel raised from the
 * identity rail.
 *
 * Registrations are consulted rarely (MYK9-478), so they get no standing room
 * on Overview — the rail carries the summary, and this holds the edit and
 * delete controls until they are asked for. A panel rather than an in-page
 * disclosure on purpose: no reveal state to place, no history contract, no
 * focus choreography, and no layout rule for the hidden case.
 */
import type { Dog } from '@/types/dog-types';
import { useRegistrationsStore } from '@/store/registrationsStore';
import SlideOverPanel from '@/components/panels/SlideOverPanel';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import RegistrationsSection from './RegistrationsSection';

interface ManageRegistrationsPanelProps {
  open: boolean;
  onClose: () => void;
  dog: Dog;
}

export default function ManageRegistrationsPanel({
  open,
  onClose,
  dog,
}: ManageRegistrationsPanelProps) {
  const isDeleteOpen = useRegistrationsStore(state => state.isDeleteRegistrationDialogOpen);
  const setIsAddOpen = useRegistrationsStore(state => state.setIsAddRegistrationDialogOpen);

  return (
    <SlideOverPanel
      open={open}
      onClose={onClose}
      title="Registrations"
      {...(dog.callName ? { subtitle: dog.callName } : {})}
      size="lg"
      // The delete confirmation is a CommonDialog, which registers no Escape
      // handler and is not in SlideOverPanel's openPanelIds stack — so without
      // this, Escape over the confirmation closes THIS panel and leaves the
      // confirmation floating over a bare page. Local workaround; MYK9-523
      // fixes the stack itself and removes this.
      preventClose={isDeleteOpen}
      // The rail's Add sits behind this backdrop, so the panel carries its own
      // for the loaded-list and error states as well as the empty one.
      headerActions={
        <Button size="sm" onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      }
    >
      <RegistrationsSection dog={dog} />
    </SlideOverPanel>
  );
}
