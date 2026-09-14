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
import SlideOverPanel from '@/components/panels/SlideOverPanel';
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
  return (
    <SlideOverPanel
      open={open}
      onClose={onClose}
      title="Registrations"
      {...(dog.callName ? { subtitle: dog.callName } : {})}
      // `size` is inert here: sizeClasses[size] is followed by `sm:max-w-none
      // sm:w-full` (MYK9-99). className is merged last, so it is what lands.
      className="md:max-w-2xl"
    >
      <RegistrationsSection dog={dog} />
    </SlideOverPanel>
  );
}
