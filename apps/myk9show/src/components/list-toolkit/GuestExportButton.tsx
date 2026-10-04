import { useAuthContext } from '@/hooks/useAuthContext';
import { LIST_LINK_BUTTON } from './ListResultLine';

interface GuestExportButtonProps {
  /** Downloads the list as CSV; the same function the signed-in header Actions export runs. */
  onExport: () => void;
  /** False while the list has no rows to export. */
  enabled: boolean;
}

/**
 * "Export CSV" for a signed-out visitor, in a public list's result line (MYK9-933). Signed-in
 * viewers export from the header Actions menu (MYK9-929), which a guest never gets, so this
 * renders only when there is no user. It exports what the list already shows: the caller passes
 * the one export function, restricted to the columns the public table renders.
 */
export function GuestExportButton({ onExport, enabled }: GuestExportButtonProps) {
  const { user } = useAuthContext();
  if (user || !enabled) return null;
  return (
    <button type="button" onClick={onExport} className={LIST_LINK_BUTTON}>
      Export CSV
    </button>
  );
}
