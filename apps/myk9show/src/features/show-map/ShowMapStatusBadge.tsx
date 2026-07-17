import { deriveTrialStatusKey } from '@myk9/core';
import { StatusBadge } from '@/components/status';
import type { ShowMapNode } from './showMapTypes';

export function ShowMapNodeStatusBadge({ node }: { node: ShowMapNode }) {
  if (!node.status) return null;

  if (node.type === 'trial') {
    return (
      <StatusBadge
        family="trial"
        status={deriveTrialStatusKey({
          trialStatus: node.status.value,
          classCount: node.childrenCount,
          hasStarted: node.status.kind === 'active',
        })}
        variant="secondary"
        label={node.status.label}
      />
    );
  }

  if (node.type === 'class') {
    return (
      <StatusBadge
        family="class"
        status={node.status.value}
        variant="secondary"
        label={node.status.label}
      />
    );
  }

  const entryStatus = node.status.kind === 'complete' ? 'completed' : node.status.value;
  return (
    <StatusBadge
      family="entry"
      status={entryStatus}
      variant="secondary"
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
      variant="outline"
      label={node.checkInStatus.label}
    />
  );
}
