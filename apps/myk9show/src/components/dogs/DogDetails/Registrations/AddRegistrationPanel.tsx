import { useEffect, useRef, type MutableRefObject } from 'react';
import { EditPanelWrapper } from '@/components/panels/edit/EditPanelWrapper';
import type { EditPanelVariant } from '@/components/panels/edit/EditPanelWrapper.types';
import { addedMessage } from '@/components/panels/edit/panelSaveErrors';
import { useEditPanel } from '@/components/panels/edit/useEditPanel';
import {
  INITIAL_REGISTRATION_DATA,
  registrationFormSchema,
  type RegistrationFormData,
} from '@/components/dogs/registrationForm';
import { RegistrationPanelFields } from './RegistrationPanelFields';

interface AddRegistrationPanelProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: RegistrationFormData) => Promise<void>;
  dogName?: string | undefined;
  className?: string | undefined;
  /** `inline` renders the form inside a host panel (the Manage registrations panel). */
  variant?: EditPanelVariant;
  closeRequestRef?: MutableRefObject<(() => void) | null>;
  /**
   * Whether this panel confirms the save with its own toast. A host whose save
   * already announces itself (the entry wizard's) passes false.
   */
  announceSaved?: boolean;
}

// This panel is hosted for the life of the page (MYK9-518), so it no longer
// unmounts between uses, and EditPanelWrapper's reset compares initialData by
// VALUE — which here is the module constant INITIAL_REGISTRATION_DATA, so it
// never changes and never fires. Without this the panel reopens holding the
// registration just saved, with Save enabled by `forceHasChanges`: a
// duplicate-row invitation. Reset on the open edge, not on a timer — a
// timer races a quick reopen, and remounting on open skips the slide-in.
//
// Seeded FALSE, not from `open`: SlideOverPanel returns null once
// `!open && !isAnimating`, so ~300ms after close THIS subtree unmounts while
// EditPanelWrapper's form state survives above it. Seeding from `open` made
// a remounted instance start at `wasOpen = true`, so the edge never fired and
// the reset never ran — on the exact path it exists for.
function ResetOnOpen({ open }: { open: boolean }) {
  const { form } = useEditPanel<RegistrationFormData>();
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!wasOpen.current && open) form?.reset(INITIAL_REGISTRATION_DATA);
    wasOpen.current = open;
  }, [open, form]);
  return null;
}

export function AddRegistrationPanel({
  open,
  onClose,
  onSave,
  dogName,
  className,
  variant,
  closeRequestRef,
  announceSaved = true,
}: AddRegistrationPanelProps) {
  return (
    <EditPanelWrapper
      open={open}
      onClose={onClose}
      title="Add Registration"
      subtitle={dogName ? `Add a new registration for ${dogName}` : 'Add a new registration record'}
      initialData={INITIAL_REGISTRATION_DATA}
      onSave={onSave}
      schema={registrationFormSchema}
      size="lg"
      {...(className !== undefined && { className })}
      {...(variant !== undefined && { variant })}
      {...(closeRequestRef !== undefined && { closeRequestRef })}
      saveLabel="Add Registration"
      {...(announceSaved && { successMessage: addedMessage(undefined, 'Registration') })}
      showUnsavedWarning={true}
      forceHasChanges={true}
    >
      <ResetOnOpen open={open} />
      <RegistrationPanelFields />
    </EditPanelWrapper>
  );
}

export default AddRegistrationPanel;
