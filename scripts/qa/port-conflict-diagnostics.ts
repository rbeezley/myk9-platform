import { execFileSync } from 'node:child_process';

// MYK9-1623: `supabase start` intermittently died on a runner with
//   failed to bind host port 0.0.0.0:54322/tcp: address already in use
// Name the socket that holds the port so a recurrence shows its cause.

const BIND_FAILURE =
  /failed to bind host port\s+(?:[\w.:[\]-]+:)?(\d{1,5})\/\w+:\s*address already in use/i;

export function detectBindFailurePort(output: string): number | null {
  const match = BIND_FAILURE.exec(output);
  if (!match) return null;
  const port = Number(match[1]);
  return port >= 1 && port <= 65535 ? port : null;
}

export function keepSocketLinesForPort(ssOutput: string, port: number): string {
  const suffix = new RegExp(`:${port}\\s`);
  return ssOutput
    .split('\n')
    .filter((line, index) => index === 0 || suffix.test(`${line} `))
    .join('\n')
    .trim();
}

/** Best effort: never throws, so it cannot mask the original start failure. */
export function describePortHolder(
  port: number,
  run: (args: string[]) => string = args =>
    execFileSync('ss', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
): string {
  try {
    const sockets = keepSocketLinesForPort(run(['-tanp']), port);
    const hasHolder = sockets.split('\n').length > 1;
    return hasHolder
      ? `Sockets on port ${port} after the failed start:\n${sockets}`
      : `No socket on port ${port} after the failed start (a connection may have held it briefly as an ephemeral source port).`;
  } catch {
    return `Could not inspect sockets on port ${port} (ss unavailable).`;
  }
}
