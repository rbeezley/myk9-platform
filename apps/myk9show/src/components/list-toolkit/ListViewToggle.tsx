/**
 * The Cards / Table switch every list carries, in the result line's right slot
 * (MYK9-929, M9): one position, one order, with words beside the icons.
 * Pass `modes` only for a list that offers more (Find Shows adds Calendar and Map).
 */

import { ViewToggle, type ViewMode as ViewToggleMode } from '@/components/common/ViewToggle';
import { CARD_TABLE_MODES } from '@/hooks/useViewPreference';

interface ListViewToggleProps {
  active: string;
  onChange: (mode: string) => void;
  modes?: readonly ViewToggleMode[];
  className?: string;
}

export function ListViewToggle({
  active,
  onChange,
  modes = CARD_TABLE_MODES,
  className,
}: ListViewToggleProps) {
  return (
    <ViewToggle
      modes={modes}
      active={active}
      onChange={onChange}
      showLabels
      {...(className ? { className } : {})}
    />
  );
}
