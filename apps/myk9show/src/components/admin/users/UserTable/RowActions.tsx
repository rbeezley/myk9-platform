/**
 * RowActions - Per-row action dropdown menu
 *
 * Renders the canonical {@link RowActionMenu} primitive, skinned with the
 * `myk9-table-*` classes so it keeps the admin table's bespoke look. The action
 * set itself comes from {@link buildUserRowActions}, which varies it by the
 * row's lifecycle state.
 */

import React from 'react';
import { RowActionMenu } from '@/components/ui/RowActionMenu';
import { User } from '@/types/user-types';
import { buildUserRowActions, type UserRowActionHandlers } from './buildUserRowActions';
import { getUserFullName } from './utils';

type RowActionsProps = UserRowActionHandlers & { user: User };

export const RowActions: React.FC<RowActionsProps> = ({ user, ...handlers }) => (
  <RowActionMenu
    actions={buildUserRowActions(user, handlers)}
    icon="horizontal"
    size="sm"
    label={`Actions for ${getUserFullName(user)}`}
    triggerClassName="myk9-table-actions-trigger"
    contentClassName="myk9-table-dropdown-content"
  />
);
