import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface TriageState {
  /** Ids of exhibitor messages we have already emailed a draft for. */
  draftedMessageIds: string[];
  /** Cluster keys we have already alerted on. */
  alertedClusterKeys: string[];
}

const MAX_DRAFTED_IDS = 2000;
const MAX_CLUSTER_KEYS = 500;

// INTENT: State is an optimisation, never a correctness dependency. A missing or
// corrupt file must degrade to redundant work — extra draft emails — and never to a
// duplicate reply reaching an exhibitor. The send path re-reads the live thread.
export async function readState(path: string): Promise<TriageState> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<TriageState>;
    return {
      draftedMessageIds: Array.isArray(parsed.draftedMessageIds) ? parsed.draftedMessageIds : [],
      alertedClusterKeys: Array.isArray(parsed.alertedClusterKeys) ? parsed.alertedClusterKeys : [],
    };
  } catch {
    return { draftedMessageIds: [], alertedClusterKeys: [] };
  }
}

export async function writeState(path: string, state: TriageState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  // Keep the file bounded — old ids can never match a live open ticket again, so
  // dropping the oldest entries is free.
  const trimmed: TriageState = {
    draftedMessageIds: state.draftedMessageIds.slice(-MAX_DRAFTED_IDS),
    alertedClusterKeys: state.alertedClusterKeys.slice(-MAX_CLUSTER_KEYS),
  };
  await writeFile(path, `${JSON.stringify(trimmed, null, 2)}\n`, 'utf8');
}

export function clusterKey(showId: string | null, newestCreatedAt: string): string {
  return `${showId ?? 'none'}|${newestCreatedAt}`;
}
