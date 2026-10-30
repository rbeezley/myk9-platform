/**
 * The class list's Up control, and the one way out of Ringside (MYK9-1500).
 *
 * Ringside mounts outside the app shell, so the Up chain (scoresheet -> entries
 * -> classes -> here) ends at the show page. The destination is PREDICTED from
 * the caller's roles and must mirror ShowManagementSectionRoute's admission
 * exactly -- see `useShowDeskAccess`.
 */
import { useNavigate } from 'react-router-dom';
import { RingsideUpButton } from '@myk9/ui';
import { useShowDeskAccess } from './useShowDeskAccess';

export function ClassListUpButton({
  showId,
  clubId,
}: {
  showId: string | undefined;
  clubId: string | undefined;
}) {
  const navigate = useNavigate();
  const canUseShowDesk = useShowDeskAccess(clubId);
  // The show home (MYK9-957) is where the desk lives now.
  const label = canUseShowDesk ? 'Show' : 'Ringside';
  const target = canUseShowDesk && showId ? `/shows/${showId}` : '/at-show';

  return <RingsideUpButton label={label} onClick={() => navigate(target)} />;
}
