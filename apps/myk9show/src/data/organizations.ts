import { getRegistry, listRegistries } from '@/features/registries';

export interface OrganizationOption {
  value: string;
  label: string;
}

/**
 * Sanctioning bodies with a real rulebook config — the only orgs a show can
 * actually be *created* for. Derived from the registry config layer so this
 * list can never drift from what the class generator supports: add a registry
 * to `listRegistries()` and it appears automatically.
 *
 * Used by the show-creation wizard. Do NOT use this for the club onboarding
 * lead form — see `ONBOARDING_ORGANIZATIONS`.
 */
export const SHOW_ORGANIZATIONS: OrganizationOption[] = listRegistries().map(id => {
  const registry = getRegistry(id);
  return { value: id, label: `${id} (${registry.name})` };
});

/**
 * Bodies the app does not (yet) support. Offered ONLY on the club onboarding
 * lead form, never in the show-creation wizard — a club running one of these
 * should still be able to raise its hand, which is exactly what the FAQ
 * ("if yours isn't listed, let us know through the club onboarding form",
 * `src/data/faqs.ts`) promises.
 */
const UNSUPPORTED_ORGANIZATIONS: OrganizationOption[] = [
  { value: 'NACSW', label: 'NACSW (National Association of Canine Scent Work)' },
  { value: 'CPE', label: 'CPE (Canine Performance Events)' },
  { value: 'USDAA', label: 'USDAA (United States Dog Agility Association)' },
  { value: 'NADAC', label: 'NADAC (North American Dog Agility Council)' },
  { value: 'NASDA', label: 'NASDA (North American Sport Dog Association)' },
  { value: 'Other', label: 'Other' },
];

/**
 * Full list for the club onboarding *lead* form: every configured registry
 * plus the unsupported bodies and an "Other" escape hatch. Intake is not the
 * same question as show creation — a lead for an unsupported org is a signal to
 * prioritize, not an error to block.
 */
export const ONBOARDING_ORGANIZATIONS: OrganizationOption[] = [
  ...SHOW_ORGANIZATIONS,
  ...UNSUPPORTED_ORGANIZATIONS,
];
