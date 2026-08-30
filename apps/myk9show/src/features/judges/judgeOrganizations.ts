import { getRegistry, listRegistries } from '@/features/registries';

/**
 * Bodies a judge can hold a qualification for.
 *
 * The registry-backed entries are DERIVED from `listRegistries()`, the same source
 * `SHOW_ORGANIZATIONS` uses, because the two lists had already diverged: this list was
 * hand-written as AKC/UKC/NACSW/CPE/OTHER while the app gained ASCA as a full registry.
 * A club could therefore create an ASCA show that no judge could ever be qualified for
 * — invisible until judge pickers began filtering by organization, at which point an
 * ASCA show would offer nobody, permanently.
 *
 * The extras below are not registries and stay hand-listed: a judge may hold credentials
 * from a body this app does not run shows for.
 */
const NON_REGISTRY_JUDGE_ORGANIZATIONS = [
  { value: 'NACSW', label: 'North American Canine Scent Work (NACSW)' },
  { value: 'CPE', label: 'Canine Performance Events (CPE)' },
  { value: 'OTHER', label: 'Other' },
];

export const JUDGE_ORGANIZATIONS: ReadonlyArray<{ value: string; label: string }> = [
  ...listRegistries().map(id => ({ value: id, label: `${getRegistry(id).name} (${id})` })),
  ...NON_REGISTRY_JUDGE_ORGANIZATIONS,
];
