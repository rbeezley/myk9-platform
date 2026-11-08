/**
 * The ringside menu with the class list's Up control beside it (MYK9-1508, menu on the left: MYK9-1770), for
 * the states that replace the list (load error, classes not on this device), so
 * the pair is placed once rather than copied into each branch.
 */
import { ClassListUpButton } from './ClassListUpButton';
import { RingsideMenu } from './menu/RingsideMenu';
import type { RingsideListSnapshot } from './menu/ringsideReturnStore';

export function ClassListUpAndMenu({
  showId,
  clubId,
  snapshot,
}: {
  showId: string | undefined;
  clubId: string | undefined;
  snapshot?: RingsideListSnapshot;
}) {
  return (
    <div className={'flex items-center justify-center gap-2'}>
      <RingsideMenu showId={showId} {...(snapshot && { snapshot })} />
      <ClassListUpButton showId={showId} clubId={clubId} />
    </div>
  );
}
