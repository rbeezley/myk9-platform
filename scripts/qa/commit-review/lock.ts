import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** One controller per runs directory. Exclusive create makes the claim atomic. */
export interface LockInfo {
  pid: number;
  host: string;
  startedAt: string;
  heartbeatAt: string;
}

export interface LockIdentity {
  pid: number;
  host: string;
  isPidAlive: (pid: number) => boolean;
  /** A lock is only recoverable once its heartbeat is older than this. */
  staleMs: number;
}

export interface HeldLock {
  heartbeat: () => void;
  release: () => void;
}

export type AcquireResult =
  { ok: true; lock: HeldLock; tookOver?: LockInfo } | { ok: false; holder: LockInfo | null };

export const LOCK_FILE = 'controller.lock';

function readLock(path: string): LockInfo | null {
  try {
    const v = JSON.parse(readFileSync(path, 'utf8')) as Partial<LockInfo>;
    if (typeof v.pid === 'number' && typeof v.heartbeatAt === 'string') return v as LockInfo;
  } catch {
    // missing or half-written: handled by the caller
  }
  return null;
}

/**
 * Stale means BOTH an old heartbeat and no live owner. A live pid on this host
 * is never stolen from (a long worker run is not a dead controller); a lock
 * from another host cannot be probed, so only the heartbeat age decides there.
 */
export function isStale(info: LockInfo, id: LockIdentity, now: Date): boolean {
  const age = now.getTime() - Date.parse(info.heartbeatAt);
  if (!(age > id.staleMs)) return false;
  return info.host === id.host ? !id.isPidAlive(info.pid) : true;
}

export function acquireLock(
  runsDir: string,
  id: LockIdentity & { now: () => Date }
): AcquireResult {
  mkdirSync(runsDir, { recursive: true });
  const path = join(runsDir, LOCK_FILE);
  const startedAt = id.now().toISOString();
  const write = (): void => {
    const info: LockInfo = {
      pid: id.pid,
      host: id.host,
      startedAt,
      heartbeatAt: id.now().toISOString(),
    };
    writeFileSync(path, JSON.stringify(info), 'utf8');
  };
  const held = (tookOver?: LockInfo): AcquireResult => ({
    ok: true,
    tookOver,
    lock: {
      heartbeat: write,
      release: () => {
        const cur = readLock(path);
        if (cur?.pid === id.pid && cur.host === id.host) rmSync(path, { force: true });
      },
    },
  });

  const info: LockInfo = { pid: id.pid, host: id.host, startedAt, heartbeatAt: startedAt };
  try {
    writeFileSync(path, JSON.stringify(info), { encoding: 'utf8', flag: 'wx' });
    return held();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
  }

  const holder = readLock(path);
  if (!holder || !isStale(holder, id, id.now())) return { ok: false, holder };

  // Recover: rename the stale file to a name only this process uses. If two
  // controllers race here, only one rename succeeds; the loser sees the winner's
  // fresh lock on its retry and is refused.
  const grave = `${path}.stale-${id.pid}-${id.now().getTime()}`;
  try {
    renameSync(path, grave);
  } catch {
    return { ok: false, holder: readLock(path) };
  }
  rmSync(grave, { force: true });
  try {
    writeFileSync(path, JSON.stringify(info), { encoding: 'utf8', flag: 'wx' });
  } catch {
    return { ok: false, holder: readLock(path) };
  }
  return held(holder);
}
