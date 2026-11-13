export interface MutationTargetDef {
  mutate: string[];
  testFiles: string[];
}
export const EXCLUDED_TESTS: Record<string, Record<string, string>>;
export const MUTATION_TARGET_DEFS: Record<string, MutationTargetDef>;
export const MUTATION_TARGET_NAMES: string[];
