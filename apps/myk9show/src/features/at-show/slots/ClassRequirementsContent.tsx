/**
 * The body of a class's Requirements (MYK9-1100, MYK9-2118): the saved max time
 * first, then the shared requirement cards, or a plain note when the class's rule
 * is not on this device yet. Ringside's dialog and Show Desk's class panel both
 * render this, so the two can never show different facts.
 */
import { Clock } from 'lucide-react';
import {
  ClassRequirementsCards,
  RequirementCard,
} from '@/components/classes/ClassRequirementsPanel';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import { classRequirementsFromClass, setMaxTimeText } from './classRequirementsFromClass';

export function ClassRequirementsContent({
  cls,
  loading,
  registry,
  perAreaTimes,
  onSetMaxTime,
}: {
  /** The live replicated class; null when the read found none. */
  cls: ReplicatedClass | null;
  loading: boolean;
  registry: string;
  perAreaTimes: boolean;
  /** Makes the max time card a button; omitted where Set Max Time is not offered. */
  onSetMaxTime?: (() => void) | undefined;
}) {
  const requirements = cls ? classRequirementsFromClass(cls, registry) : null;
  const maxTime = (
    <RequirementCard
      icon={<Clock className="h-4 w-4" />}
      colorClass="bg-blue-500/15 text-blue-500"
      label="Max Time (this class)"
      value={setMaxTimeText(cls, perAreaTimes)}
      subtitle={onSetMaxTime ? 'Tap to set' : undefined}
    />
  );
  const maxTimeCard = onSetMaxTime ? (
    <button
      type="button"
      className="block w-full text-left"
      onClick={onSetMaxTime}
      aria-label="Set Max Time"
    >
      {maxTime}
    </button>
  ) : (
    maxTime
  );

  if (loading) return <p className="text-sm text-muted-foreground">Loading requirements…</p>;
  if (requirements) {
    return (
      <ClassRequirementsCards
        requirements={requirements}
        className="space-y-3"
        leading={maxTimeCard}
      />
    );
  }
  return (
    <div className="space-y-3">
      {maxTimeCard}
      <p className="text-sm text-muted-foreground">
        This class&apos;s rules aren&apos;t on this device yet. They will appear once this device
        gets the latest show data.
      </p>
    </div>
  );
}
