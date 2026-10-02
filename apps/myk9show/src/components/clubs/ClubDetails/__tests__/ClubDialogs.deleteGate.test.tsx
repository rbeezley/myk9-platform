/**
 * Delete club is offered through the Edit panel's footer, and only to a viewer
 * the server accepts: `soft_delete_club` requires a site admin
 * (`is_platform_admin()`, a wrapper of `is_site_admin()`). Each role is run
 * through the real `computeClubPermissions` and the real `ClubDialogs`.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import type { Club } from '@/types/club-types';
import type { EditPanelDeleteOption } from '@/components/panels/edit/EditPanelDelete';
import { ClubDialogs } from '../ClubDialogs';
import { computeClubPermissions } from '../clubPermissions';

const seen: { onDelete?: EditPanelDeleteOption | undefined }[] = [];
vi.mock('@/components/panels/edit/ClubEditPanel', () => ({
  ClubEditPanel: (props: { onDelete?: EditPanelDeleteOption | undefined }) => {
    seen.push({ onDelete: props.onDelete });
    return null;
  },
}));
vi.mock('../../ClubPhotoDialog', () => ({ default: () => null }));
vi.mock('../../members/AddMemberDialog', () => ({ AddMemberDialog: () => null }));

const club = { id: 'k1', name: 'Heartland KC', city: 'Omaha' } as unknown as Club;
const noop = () => undefined;

function renderDialogs(canDeleteClub: boolean, onClubDeleted = noop) {
  seen.length = 0;
  render(
    <ClubDialogs
      club={club}
      showEditPanel
      onCloseEditPanel={noop}
      onSaveEdit={async () => undefined}
      showPhotoDialog={false}
      onPhotoDialogChange={noop}
      previewImage={null}
      isDragging={false}
      onPhotoDrop={noop}
      onPhotoDragOver={noop}
      onPhotoDragLeave={noop}
      onPhotoFileInput={noop}
      onPhotoCancel={noop}
      onPhotoSave={async () => undefined}
      canDeleteClub={canDeleteClub}
      onClubDeleted={onClubDeleted}
      showAddMemberDialog={false}
      onAddMemberDialogChange={noop}
      members={[]}
    />
  );
  return seen[seen.length - 1]?.onDelete;
}

describe('Delete club gate (server: site admin only)', () => {
  const roles = [
    { role: 'site admin', isSiteAdmin: true, isClubAdmin: false, allowed: true },
    { role: 'club admin of this club', isSiteAdmin: false, isClubAdmin: true, allowed: false },
    { role: 'secretary or other staff', isSiteAdmin: false, isClubAdmin: false, allowed: false },
  ];

  it.each(roles)('$role: allowed is $allowed', ({ isSiteAdmin, isClubAdmin, allowed }) => {
    const { canDeleteClub } = computeClubPermissions({ isSiteAdmin, isClubAdmin });
    expect(canDeleteClub).toBe(allowed);
    const option = renderDialogs(canDeleteClub);
    expect(option === undefined).toBe(!allowed);
  });

  it('hands the panel the club, named with its city, and the post-delete navigation', () => {
    const onClubDeleted = vi.fn();
    const option = renderDialogs(true, onClubDeleted);
    expect(option).toMatchObject({
      kind: 'club',
      objectLabel: 'club',
      targets: [{ id: 'k1', name: 'Heartland KC', detail: 'Heartland KC · Omaha' }],
      onDeleted: onClubDeleted,
    });
  });
});
