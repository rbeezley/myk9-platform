const PREFIX = 'myk9:result-reveal-seen:';

export function hasSeenResultReveal(releaseKey: string): boolean {
  try {
    return localStorage.getItem(`${PREFIX}${releaseKey}`) === '1';
  } catch {
    return false;
  }
}

export function markResultRevealSeen(releaseKey: string): void {
  try {
    localStorage.setItem(`${PREFIX}${releaseKey}`, '1');
  } catch {
    // Storage can be unavailable in private browsing or locked-down contexts.
  }
}
