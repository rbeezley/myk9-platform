import React from 'react';
import type { Registration } from '@/types/dog-types';
import { useRegisterActionBar } from '@/hooks/useRegisterActionBar';
import {
  RegistrationFormBody,
  RegistrationFormFooter,
} from '@/components/dogs/RegistrationFormBody';
import { useRegistrationEditor } from '@/components/dogs/useRegistrationEditor';
import { EditPanelInlineShell } from '../EditPanelShells';

interface RegistrationFormInlineProps {
  initialData?: Registration | undefined;
  /** Writes to the unsaved dog's form state, never the database. */
  onSave: (registration: Registration) => void;
  /** Saved or cancelled: back to the dog form. */
  onDone: () => void;
}

/**
 * Add Dog's registration form as a sub-mode of the panel hosting Add Dog
 * (MYK9-1081): the one registration form (RegistrationFormBody), in the host's body
 * with a sticky footer, instead of a second slide-out stacked on the host.
 */
export const RegistrationFormInline: React.FC<RegistrationFormInlineProps> = ({
  initialData,
  onSave,
  onDone,
}) => {
  const editor = useRegistrationEditor({ open: true, onSave, initialData, onSaved: onDone });
  const actionBarRef = useRegisterActionBar<HTMLDivElement>();
  return (
    <EditPanelInlineShell
      body={<RegistrationFormBody editor={editor} />}
      footer={<RegistrationFormFooter editor={editor} onCancel={onDone} />}
      actionBarRef={actionBarRef}
    />
  );
};
