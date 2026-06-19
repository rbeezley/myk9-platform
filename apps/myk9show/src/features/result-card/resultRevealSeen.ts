const PREFIX = 'myk9:result-reveal-seen:';

export function hasSeenResultReveal(releaseKey: string): boolean {
  return localStorage.getItem(`${PREFIX}${releaseKey}`) === '1';
}

export function markResultRevealSeen(releaseKey: string): void {
  localStorage.setItem(`${PREFIX}${releaseKey}`, '1');
}
