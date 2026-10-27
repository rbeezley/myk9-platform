/**
 * MYK9-1440: Node's fetch (undici) cancels a Response's stream when the Response is
 * garbage collected, and a `clone()` that code reads and then drops takes the original's
 * body with it ("Body is unusable: Body has already been read"). Browsers do not do this,
 * so production code that clones-and-drops (stepUpFetch's isStepUpRefusal, the ringside
 * navigation loader, the load-test observingFetch) is fine; a TEST that hands such a
 * Response to that code and reads the original afterwards flaked whenever a GC pass landed
 * in between (CI memory pressure).
 *
 * Installed once from setup.ts for every test: every clone stays reachable until the
 * global afterEach releases it, so no test needs to opt in.
 */
const keptClones: Response[] = [];
const originalClone = Response.prototype.clone;

export function installResponseCloneKeepAlive(): void {
  Response.prototype.clone = function keptClone(this: Response): Response {
    const copy = originalClone.call(this);
    keptClones.push(copy);
    return copy;
  };
}

export function releaseKeptResponseClones(): void {
  keptClones.length = 0;
}
