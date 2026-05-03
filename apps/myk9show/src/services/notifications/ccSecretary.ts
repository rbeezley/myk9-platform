/** Returns [secretaryEmail] when CC is enabled, or [] otherwise. */
export function resolveSecretaryCc(
  ccToggle: boolean | null | undefined,
  secretaryEmail: string | null | undefined
): string[] {
  const enabled = ccToggle ?? true; // pre-migration rows have no column → default on
  if (!enabled) return [];
  if (!secretaryEmail) return [];
  return [secretaryEmail];
}
