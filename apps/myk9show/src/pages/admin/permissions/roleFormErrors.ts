import type { FieldErrorMap } from '@/components/forms';

/** Control ids shared by the Create and Clone role pages. */
export const ROLE_FIELD = {
  displayName: 'display-name',
  name: 'role-name',
  permissions: 'role-permissions',
} as const;

interface RoleFormValues {
  name: string;
  displayName: string;
  selectedPermissionCount: number;
  /** Names of roles that already exist (Create checks this; Clone does not). */
  existingRoleNames?: readonly string[];
}

/** One message per failing field, keyed by control id. */
export function validateRoleForm(values: RoleFormValues): FieldErrorMap {
  const errors: Record<string, string> = {};
  if (!values.displayName.trim()) errors[ROLE_FIELD.displayName] = 'Enter a display name.';
  const name = values.name.trim();
  if (!name) errors[ROLE_FIELD.name] = 'Enter a role name.';
  else if (values.existingRoleNames?.some(n => n.toLowerCase() === name.toLowerCase())) {
    errors[ROLE_FIELD.name] = 'A role with this name already exists.';
  }
  if (values.selectedPermissionCount === 0) {
    errors[ROLE_FIELD.permissions] = 'Select at least one permission.';
  }
  return errors;
}
