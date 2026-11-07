/**
 * The p_override / p_reason arguments of soft_delete_show, soft_delete_trial and
 * soft_delete_class (MYK9-1596). Omitted unless the site admin armed the
 * override, so an ordinary delete sends exactly what it always did. The server
 * refuses an override without a reason and records the reason in the audit log.
 */
export interface OverrideOptions {
  /** Site-admin override of the MK010 guard; the server refuses it for anyone else. */
  override?: boolean | undefined;
  /** Why (required by the server when overriding). */
  reason?: string | undefined;
}

export function overrideRpcArgs(options: OverrideOptions): {
  p_override?: true;
  p_reason?: string;
} {
  if (!options.override) return {};
  return options.reason === undefined
    ? { p_override: true }
    : { p_override: true, p_reason: options.reason };
}
