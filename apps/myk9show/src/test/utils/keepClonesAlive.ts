/**
 * MYK9-1440: Node's fetch (undici) cancels a Response's stream when the Response is
 * garbage collected, and a `clone()` that the code under test reads and then drops takes
 * the original's body with it ("Body is unusable: Body has already been read"). A browser
 * does not do this, so production code that clones-and-drops is fine; a TEST that hands
 * such a Response to that code and reads the original afterwards flakes whenever a GC pass
 * lands in between (CI memory pressure).
 *
 * Wrap every Response a test passes to clone-and-drop code. Clones stay reachable until
 * `releaseKeptClones()` (call it from `afterEach`).
 */
const keptClones: Response[] = [];

export function keepClonesAlive<T extends Response>(response: T): T {
  const clone = response.clone.bind(response);
  response.clone = () => {
    const copy = clone();
    keptClones.push(copy);
    return copy;
  };
  return response;
}

export function releaseKeptClones(): void {
  keptClones.length = 0;
}
