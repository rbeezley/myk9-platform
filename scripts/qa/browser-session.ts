import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** Own one CLI session for the lifetime of a foreground command. */
export async function runBrowserSession(
  command: string[],
  options: { cli?: string; closeTimeoutMs?: number; graceMs?: number } = {}
): Promise<number> {
  if (!command.length) throw new Error('Usage: browser-session <command> [args...]');
  const session = `myk9-${process.pid}-${randomUUID().slice(0, 8)}`;
  const env = { ...process.env, PLAYWRIGHT_CLI_SESSION: session };
  console.error(`[browser-session] Owned session: ${session}`);
  let interrupted = 0;
  let workFinished = false;
  let cancellation: Promise<void> | undefined;
  const child = spawn(command[0], command.slice(1), {
    env,
    stdio: 'inherit',
    detached: true,
  });
  const signalGroup = (signal: NodeJS.Signals) => {
    if (!child.pid) return;
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  };
  const interrupt = (signal: NodeJS.Signals) => {
    interrupted ||= signal === 'SIGINT' ? 130 : 143;
    if (workFinished) return;
    signalGroup(signal);
    cancellation ??= new Promise(resolve => {
      setTimeout(() => {
        signalGroup('SIGKILL');
        resolve();
      }, options.graceMs ?? 5000);
    });
  };
  const onInt = () => interrupt('SIGINT');
  const onTerm = () => interrupt('SIGTERM');
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  let status = 1;
  try {
    status = await new Promise<number>(resolve => {
      child.once('error', error => {
        console.error(`[browser-session] ${error.message}`);
        resolve(1);
      });
      child.once('exit', (code, signal) => {
        resolve(code ?? (signal ? 1 : 0));
      });
    });
  } finally {
    await cancellation;
    workFinished = true;
    // Keep signal handlers installed during cleanup so a second Ctrl-C cannot skip it.
    const closed = await new Promise<boolean>(resolve => {
      const closer = spawn(options.cli ?? 'playwright-cli', [`-s=${session}`, 'close'], {
        env,
        stdio: 'inherit',
        detached: true,
      });
      const timer = setTimeout(() => {
        if (!closer.pid) return;
        try {
          process.kill(-closer.pid, 'SIGKILL');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') console.error(error);
        }
      }, options.closeTimeoutMs ?? 10000);
      closer.once('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
      closer.once('exit', code => {
        clearTimeout(timer);
        resolve(code === 0);
      });
    });
    process.off('SIGINT', onInt);
    process.off('SIGTERM', onTerm);
    if (!closed) {
      console.error(
        `[browser-session] Cleanup failed. Inspect and close only: playwright-cli -s=${session} close`
      );
      status ||= 1;
    }
  }
  return interrupted || status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBrowserSession(process.argv.slice(2)).then(
    code => {
      process.exitCode = code;
    },
    (error: Error) => {
      console.error(error.message);
      process.exitCode = 1;
    }
  );
}
