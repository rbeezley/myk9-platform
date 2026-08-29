import type { EditMode } from './show-creation-wizard-types';

export function applyReturnedClubId(
  clubId: string | null,
  editMode: EditMode | undefined,
  updateShowData: (data: { clubId: string }) => void
): void {
  if (clubId && !editMode) {
    updateShowData({ clubId });
  }
}
