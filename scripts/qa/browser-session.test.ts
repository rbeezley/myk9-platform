import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { runBrowserSession } from './browser-session';

async function fixture(closeBody = 'exit 0') {
  const dir = await mkdtemp(join(tmpdir(), 'browser-owner-'));
  const cli = join(dir, 'cli');
  const log = join(dir, 'close');
  const owned = join(dir, 'owned');
  await writeFile(cli, `#!/bin/sh\nprintf '%s\\n' "$@" > '${log}'\n${closeBody}\n`, {
    mode: 0o700,
  });
  return { dir, cli, log, owned };
}

for (const code of [0, 7]) {
  test(`closes exactly the owned session and preserves exit ${code}`, async () => {
    const f = await fixture();
    try {
      const result = await runBrowserSession(
        ['sh', '-c', `printf '%s' "$PLAYWRIGHT_CLI_SESSION" > '${f.owned}'; exit ${code}`],
        { cli: f.cli }
      );
      assert.equal(result, code);
      const session = await readFile(f.owned, 'utf8');
      assert.match(session, /^myk9-\d+-[a-f0-9]{8}$/);
      assert.equal(await readFile(f.log, 'utf8'), `-s=${session}\nclose\n`);
    } finally {
      await rm(f.dir, { recursive: true, force: true });
    }
  });
}

test('cleanup failure makes a successful run fail', async () => {
  const f = await fixture('exit 3');
  try {
    assert.equal(await runBrowserSession(['sh', '-c', 'exit 0'], { cli: f.cli }), 1);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test('failed command launch still closes its owned session', async () => {
  const f = await fixture();
  try {
    assert.equal(await runBrowserSession(['/nonexistent/myk9-command'], { cli: f.cli }), 1);
    assert.match(await readFile(f.log, 'utf8'), /\nclose\n$/);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test('SIGTERM closes the session and returns cancellation status', async () => {
  const f = await fixture();
  try {
    const result = runBrowserSession(['sh', '-c', 'sleep 10'], { cli: f.cli, graceMs: 50 });
    process.emit('SIGTERM');
    assert.equal(await result, 143);
    assert.match(await readFile(f.log, 'utf8'), /\nclose\n$/);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test('hung cleanup is bounded and reported as failure', async () => {
  const f = await fixture('exec sleep 10');
  try {
    assert.equal(
      await runBrowserSession(['sh', '-c', 'exit 0'], { cli: f.cli, closeTimeoutMs: 50 }),
      1
    );
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

async function readPid(path: string): Promise<number> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const contents = await readFile(path, 'utf8').catch(() => '');
    if (contents.trim()) return Number(contents.trim());
    await delay(10);
  }
  throw new Error(`Child did not report its PID: ${path}`);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}

async function assertStopped(pid: number) {
  for (let attempt = 0; attempt < 20 && isAlive(pid); attempt++) await delay(10);
  assert.equal(isAlive(pid), false, `Owned descendant ${pid} survived cleanup`);
}

test('cancellation stops a descendant even when its shell leader exits first', async () => {
  const f = await fixture();
  const pidFile = join(f.dir, 'descendant-pid');
  let pid: number | undefined;
  try {
    const result = runBrowserSession(
      ['sh', '-c', `sh -c 'trap "" TERM INT; echo $$ > "${pidFile}"; sleep 2' & wait`],
      { cli: f.cli, graceMs: 50 }
    );
    pid = await readPid(pidFile);
    process.emit('SIGTERM');
    assert.equal(await result, 143);
    await assertStopped(pid);
  } finally {
    if (pid && isAlive(pid)) process.kill(pid, 'SIGKILL');
    await rm(f.dir, { recursive: true, force: true });
  }
});

test('cleanup timeout stops descendants of the CLI launcher', async () => {
  const f = await fixture();
  const pidFile = join(f.dir, 'closer-descendant-pid');
  let pid: number | undefined;
  try {
    await writeFile(
      f.cli,
      `#!/bin/sh\nsh -c 'trap "" TERM INT; echo $$ > "${pidFile}"; sleep 2' & wait\n`
    );
    const result = runBrowserSession(['sh', '-c', 'exit 0'], {
      cli: f.cli,
      closeTimeoutMs: 250,
    });
    pid = await readPid(pidFile);
    assert.equal(await result, 1);
    await assertStopped(pid);
  } finally {
    if (pid && isAlive(pid)) process.kill(pid, 'SIGKILL');
    await rm(f.dir, { recursive: true, force: true });
  }
});
