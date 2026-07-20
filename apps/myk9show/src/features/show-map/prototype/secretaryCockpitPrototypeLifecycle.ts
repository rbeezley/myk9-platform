import type {
  CockpitClassPrototype,
  CockpitPrototypeStatus,
} from './secretaryCockpitPrototypeData';

export interface PrototypeLifecycleOverride {
  status: CockpitPrototypeStatus;
  actualStartTime?: string | undefined;
  actualEndTime?: string | undefined;
}

function formatTransitionTime(now: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(now);
}

export function buildPrototypeLifecycleOverride(
  classItem: CockpitClassPrototype,
  status: CockpitPrototypeStatus,
  now = new Date()
): PrototypeLifecycleOverride {
  const transitionTime = formatTransitionTime(now);
  const actualStartTime =
    status === 'in-progress'
      ? (classItem.actualStartTime ?? transitionTime)
      : status === 'not-started'
        ? undefined
        : classItem.actualStartTime;
  const actualEndTime =
    status === 'complete'
      ? transitionTime
      : status === 'cancelled'
        ? classItem.actualEndTime
        : undefined;

  return { status, actualStartTime, actualEndTime };
}
