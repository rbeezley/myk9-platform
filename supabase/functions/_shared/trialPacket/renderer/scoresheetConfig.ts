/**
 * Registry-varied vocabulary for the scoresheet.
 *
 * Lives here, not in `@/features/registries`, because a Deno edge function
 * cannot reach into `apps/myk9show/src` and this module is imported by both
 * runtimes (the app side is a re-export shim, not a copy). `@/features/registries`
 * keeps what it owns — landing style, trial registry, timezone — and does not
 * gain scoresheet vocabulary.
 *
 * The SHAPE is identical across registries; only the wording changes. That is
 * the finding this whole design rests on: the sheet already reads element,
 * level, section, hides, distractions and per-area time limits from class data.
 */

export interface ScoresheetRegistryConfig {
  /** Printed in the sheet title, e.g. "AKC Scent Work Scoresheet". */
  orgTitle: string;
  /** Checkbox row. Scent work is Q / NQ / EX / ABS. */
  resultStates: readonly string[];
  /** Tallied by the judge into small numeric boxes — counts, not notes. */
  faultCounters: readonly string[];
  nqReasons: readonly string[];
  exReasons: readonly string[];
}

const SCENT_WORK_RESULT_STATES = ['Q', 'NQ', 'EX', 'ABS'] as const;
const SCENT_WORK_FAULTS = ['Handler Error', 'Safety Concern', 'Mild Disruption'] as const;

export const GENERIC_SCORESHEET_CONFIG: ScoresheetRegistryConfig = {
  orgTitle: 'Scent Work',
  resultStates: SCENT_WORK_RESULT_STATES,
  faultCounters: SCENT_WORK_FAULTS,
  nqReasons: [
    'Incorrect Call',
    'Max Time',
    'Point to Hide',
    'Harsh Correction',
    'Significant Disruption',
  ],
  exReasons: [
    'Eliminated in Area',
    'Handler Request',
    'Out of Control',
    'Overly Stressed',
    'Other',
  ],
};

export const SCORESHEET_CONFIGS: Record<string, ScoresheetRegistryConfig> = {
  akc: { ...GENERIC_SCORESHEET_CONFIG, orgTitle: 'AKC Scent Work' },
  ukc: { ...GENERIC_SCORESHEET_CONFIG, orgTitle: 'UKC Nosework' },
  asca: { ...GENERIC_SCORESHEET_CONFIG, orgTitle: 'ASCA Scent Detection' },
};

/**
 * Never throws. An unknown id falls back to the generic config and warns; a
 * null id falls back silently, because "no registry recorded" is ordinary data
 * rather than a misconfiguration worth logging on every page.
 */
export function resolveScoresheetConfig(
  registryId: string | null | undefined
): ScoresheetRegistryConfig {
  if (!registryId) return GENERIC_SCORESHEET_CONFIG;
  const config = SCORESHEET_CONFIGS[registryId.toLowerCase()];
  if (config) return config;
  console.warn(`resolveScoresheetConfig: unknown registryId "${registryId}", using generic sheet`);
  return GENERIC_SCORESHEET_CONFIG;
}
