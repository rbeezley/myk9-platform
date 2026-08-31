import { deriveTrialStatusKey } from '@myk9/core';
import { getStatusSurfaceClasses, StatusBadge } from '@/components/status';
import type { ShowMapNode } from './showMapTypes';

export function ShowMapNodeStatusBadge({ node }: { node: ShowMapNode }) {
  if (!node.status) return null;

  if (node.type === 'trial') {
    const status = deriveTrialStatusKey({
      trialStatus: node.status.value,
      classCount: node.childrenCount,
      completedCount: node.progress?.completed,
      hasStarted: node.status.kind === 'active',
    });

    return (
      <StatusBadge
        family="trial"
        status={status}
        className={getStatusSurfaceClasses('trial', status)}
      />
    );
  }

  if (node.type === 'class') {
    return (
      <StatusBadge
        family="class"
        status={node.status.value}
        className={getStatusSurfaceClasses('class', node.status.value)}
        label={node.status.label}
      />
    );
  }

  const entryStatus =
    node.status.kind === 'muted'
      ? 'pulled'
      : node.status.kind === 'complete'
        ? 'completed'
        : node.status.value;
  return (
    <StatusBadge
      family="entry"
      status={entryStatus}
      className={getStatusSurfaceClasses('entry', entryStatus)}
      label={node.status.label}
    />
  );
}

export function ShowMapCheckInStatusBadge({ node }: { node: ShowMapNode }) {
  if (!node.checkInStatus) return null;
  return (
    <StatusBadge
      family="entry"
      status={node.checkInStatus.value}
      className={getStatusSurfaceClasses('entry', node.checkInStatus.value)}
      label={node.checkInStatus.label}
    />
  );
}
