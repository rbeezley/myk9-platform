/**
 * ThreeDotMenu — user/dog/profile overflow menu (View / Edit / photo / status /
 * qualifications / Delete). A thin adapter over the canonical {@link RowActionMenu}
 * primitive: the prop API is preserved so its call sites don't change, but all menu
 * behavior (trigger, a11y, destructive token, separators) now lives in one place.
 *
 * New code should prefer RowActionMenu directly; this wrapper exists for the existing
 * profile/list surfaces that pass these named callbacks.
 */
import React from 'react';
import { Eye, Pencil, Camera, Activity, Award, Send, Trash2 } from 'lucide-react';
import { RowActionMenu, type RowAction } from '@/components/ui/RowActionMenu';

interface ThreeDotMenuProps {
  onView?: (() => void) | undefined;
  onEdit?: (() => void) | undefined;
  onEditPhoto?: (() => void) | undefined;
  onChangeStatus?: (() => void) | undefined;
  changeStatusLabel?: string | undefined;
  changeStatusDisabled?: boolean | undefined;
  changeStatusDescription?: string | undefined;
  onManageQualifications?: (() => void) | undefined;
  /** Send or resend a sign-in invitation (MYK9-134). Omit to hide the item. */
  onSendInvitation?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
  viewLabel?: string | undefined;
  editLabel?: string | undefined;
  /** Wording differs for someone who already has an account vs one who does not. */
  sendInvitationLabel?: string | undefined;
  sendInvitationDisabled?: boolean | undefined;
  showManageQualifications?: boolean | undefined;
  /** Hide the Edit item (use when a separate Edit button is rendered alongside) */
  hideEdit?: boolean | undefined;
}

const ThreeDotMenu: React.FC<ThreeDotMenuProps> = ({
  onView,
  onEdit,
  onEditPhoto,
  onChangeStatus,
  changeStatusLabel = 'Change status',
  changeStatusDisabled = false,
  changeStatusDescription,
  onManageQualifications,
  onSendInvitation,
  onDelete,
  viewLabel = 'View',
  editLabel = 'Edit Profile',
  sendInvitationLabel = 'Send Invitation',
  sendInvitationDisabled = false,
  showManageQualifications = false,
  hideEdit = false,
}) => {
  const actions: RowAction[] = [];

  if (onView) {
    actions.push({ id: 'view', label: viewLabel, icon: <Eye />, onSelect: onView });
  }
  if (onEdit && !hideEdit) {
    actions.push({ id: 'edit', label: editLabel, icon: <Pencil />, onSelect: onEdit });
  }
  if (onEditPhoto) {
    actions.push({ id: 'photo', label: 'Change Photo', icon: <Camera />, onSelect: onEditPhoto });
  }
  if (onChangeStatus) {
    actions.push({
      id: 'status',
      label: changeStatusLabel,
      icon: <Activity />,
      onSelect: onChangeStatus,
      disabled: changeStatusDisabled,
      ...(changeStatusDescription ? { description: changeStatusDescription } : {}),
    });
  }
  if (showManageQualifications && onManageQualifications) {
    actions.push({
      id: 'qualifications',
      label: 'Manage Qualifications',
      icon: <Award />,
      onSelect: onManageQualifications,
      separatorBefore: true,
    });
  }
  if (onSendInvitation) {
    actions.push({
      id: 'send-invitation',
      label: sendInvitationLabel,
      icon: <Send />,
      onSelect: onSendInvitation,
      disabled: sendInvitationDisabled,
      separatorBefore: true,
    });
  }
  if (onDelete) {
    actions.push({
      id: 'delete',
      label: 'Delete',
      icon: <Trash2 />,
      onSelect: onDelete,
      variant: 'destructive',
    });
  }

  return (
    <RowActionMenu
      actions={actions}
      label="More actions"
      size="touch"
      triggerClassName="h-10 w-10"
    />
  );
};

export default ThreeDotMenu;
