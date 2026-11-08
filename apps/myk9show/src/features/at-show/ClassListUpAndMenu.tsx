/**
 * The ringside menu with the class list's Up control beside it (MYK9-1508, menu on the left: MYK9-1770), for
 * the states that replace the list (load error, classes not on this device), so
 * the pair is placed once rather than copied into each branch.
 */
import { ClassListUpButton } from './ClassListUpButton';
import { RingsideMenu } from './menu/RingsideMenu';

export function ClassListUpAndMenu({
  showId,
  clubId,
}: {
  showId: string | undefined;
  clubId: string | undefined;
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      <RingsideMenu showId={showId} />
      <ClassListUpButton showId={showId} clubId={clubId} />
    </div>
  );
}
