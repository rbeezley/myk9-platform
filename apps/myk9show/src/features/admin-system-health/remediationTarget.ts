declare const routeBrand: unique symbol;
declare const externalBrand: unique symbol;
type InternalRoute = string & { readonly [routeBrand]: true };
type ApprovedExternalUrl = string & { readonly [externalBrand]: true };
export type RemediationTarget =
  { kind: 'route'; href: InternalRoute } | { kind: 'external'; href: ApprovedExternalUrl };

export const DATABASE_ACCESS_RUNBOOK =
  'https://github.com/rbeezley/myk9-platform/blob/main/docs/operations/START-HERE.md';

export function routeTarget(href: string): RemediationTarget {
  if (
    !/^\/(?!\/)/.test(href) ||
    /[\\\s]/.test(href) ||
    [...href].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  ) {
    throw new Error('Remediation route must be an internal absolute path');
  }
  return { kind: 'route', href: href as InternalRoute };
}

export function externalTarget(href: string): RemediationTarget {
  // Only owner-approved public operator destinations belong in this registry.
  if (href !== DATABASE_ACCESS_RUNBOOK) throw new Error('Unapproved remediation URL');
  return { kind: 'external', href: href as ApprovedExternalUrl };
}
