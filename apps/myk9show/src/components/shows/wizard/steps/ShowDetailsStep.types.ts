import { getRegistry, listRegistries } from '@/features/registries';

export interface ShowDetailsStepProps {
  className?: string;
}

export interface OrganizationOption {
  value: string;
  label: string;
}

export interface ResolvedJudge {
  id: string;
  name: string;
  judgeNumber: string;
}

/**
 * The organization dropdown is derived from the registry config layer — only
 * sanctioning bodies with a real rulebook config (`listRegistries()`) are
 * offered. Hardcoding a broader list let secretaries pick a body the app can't
 * run (NACSW/CPE/USDAA/NADAC/NASDA/Other) and dead-end at an empty class step
 * (docs/audits/2026-07-01-show-creation-wizard-ux.md §4). Deriving here means
 * this list can never again drift from what the class generator supports: add a
 * registry to `listRegistries()` and it appears automatically.
 */
export const ORGANIZATIONS: OrganizationOption[] = listRegistries().map(id => {
  const registry = getRegistry(id);
  return { value: id, label: `${id} (${registry.name})` };
});
