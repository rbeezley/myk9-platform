// One automatic offline-copy save per signed-in user, sign-in and show for the page session
// (MYK9-1994). Module scope, so remounting the header never starts another forced full sync.
const tried = new Set<string>();

export const hasTriedAutoSave = (key: string): boolean => tried.has(key);
export const markAutoSaveTried = (key: string): void => {
  tried.add(key);
};
/** Tests only. */
export const resetAutoSaveAttempts = (): void => tried.clear();
