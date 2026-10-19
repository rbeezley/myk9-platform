import React from 'react';
import { FieldError, fieldErrorControlProps } from '@/components/forms';
import {
  RolePermissionsEditor,
  type RolePermissionsEditorProps,
} from '@/components/admin/permissions/RolePermissionsEditor';
import { ROLE_FIELD } from './roleFormErrors';

/**
 * The permissions editor with its "select at least one" callout under the heading. The group
 * container takes focus (tabIndex -1) when that is the first failing field on a failed submit.
 */
export const RolePermissionsGroup: React.FC<
  RolePermissionsEditorProps & { error: string | undefined }
> = ({ error, ...editorProps }) => (
  <div
    id={ROLE_FIELD.permissions}
    role="group"
    aria-label="Permissions"
    tabIndex={-1}
    className="scroll-mt-24 focus-visible:outline-none"
    {...fieldErrorControlProps(ROLE_FIELD.permissions, error)}
  >
    <FieldError field={ROLE_FIELD.permissions} message={error} className="mt-0 mb-4" />
    <RolePermissionsEditor {...editorProps} />
  </div>
);
