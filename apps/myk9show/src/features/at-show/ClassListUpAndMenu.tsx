/**
 * The class list's Up control with the ringside menu beside it (MYK9-1508), for
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
    <>
      <ClassListUpButton showId={showId} clubId={clubId} />
      <RingsideMenu showId={showId} />
    </>
  );
}
