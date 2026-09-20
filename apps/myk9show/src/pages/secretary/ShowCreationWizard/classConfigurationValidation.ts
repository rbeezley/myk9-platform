import { deriveRegistryId } from '@/features/registries';
import { getScentWorkSport, normalizeScentWorkElementLabel } from '@/features/registries/scentWork';
import type { ElementSpec, RegistryId, RegistrySport } from '@/features/registries/types';
import { formatTrialTypeLabel } from '@/types/template.types';

export interface WizardClassSelectionLike {
  customizations: Record<string, unknown>;
  templateId?: string;
  judgeId?: string | undefined;
}

export interface WizardTrialSelectionLike {
  id?: string;
  trialType?: string | undefined;
  classes: readonly WizardClassSelectionLike[];
}

export interface CanonicalWizardClassTriple {
  registryId: RegistryId;
  element: string;
  level: string;
  section: string;
}

export interface NormalizedWizardClassSelection {
  className: string;
  templateId: string;
  judgeId?: string | undefined;
  triple: CanonicalWizardClassTriple;
}

export interface NormalizedWizardTrialSelection {
  trialId: string;
  trialType?: string | undefined;
  classes: readonly NormalizedWizardClassSelection[];
}

export interface InvalidWizardClass {
  className: string;
  reason: string;
}

/**
 * A typed, user-facing failure for class identity. It is thrown before any show,
 * trial, or class writer is called, so the wizard cannot leave a partial show behind.
 */
export class InvalidWizardClassConfigurationError extends Error {
  readonly invalidClasses: readonly InvalidWizardClass[];

  constructor(invalidClasses: readonly InvalidWizardClass[]) {
    const details = invalidClasses
      .map(({ className, reason }) => `“${className}”: ${reason}`)
      .join(' ');
    super(`Before saving, return to Classes and choose a valid registry class for ${details}`);
    this.name = 'InvalidWizardClassConfigurationError';
    this.invalidClasses = invalidClasses;
  }
}

/**
 * Validate every selected class before a persistence mutation begins.
 *
 * Registry structure is authoritative for the configured scent-work registries. Other
 * disciplines may have custom class definitions that are not yet represented in the
 * registry config, so those classes still receive the sentinel guard without being
 * incorrectly forced through a scent-work matrix.
 */
export function assertValidWizardClassSelections(
  organization: string,
  trials: readonly WizardTrialSelectionLike[]
): readonly NormalizedWizardTrialSelection[] {
  const normalizedTrials = normalizeWizardClassSelections(organization, trials);
  const invalidClasses: InvalidWizardClass[] = [];

  normalizedTrials.forEach(trial => {
    const registrySport = isConfiguredScentTrial(trial.trialType)
      ? getScentWorkSport(trial.classes[0]?.triple.registryId ?? deriveRegistryId(organization))
      : null;
    trial.classes.forEach((classSelection, classIndex) => {
      const className = classSelection.className || `Class ${classIndex + 1}`;
      const { triple } = classSelection;

      const sentinelError = validateSentinelValues(triple);
      if (sentinelError) {
        invalidClasses.push({ className, reason: sentinelError });
        return;
      }

      if (!registrySport) return;

      const reason = validateAgainstRegistry(registrySport, triple);
      if (reason) invalidClasses.push({ className, reason });
    });
  });

  if (invalidClasses.length > 0) {
    throw new InvalidWizardClassConfigurationError(invalidClasses);
  }

  return normalizedTrials;
}

/**
 * Normalize every registry class field once at the wizard boundary. The returned triple is the
 * only class identity that downstream validation, generation, deduplication, and persistence may
 * consume. Unknown values stay trimmed so validation can explain the rejected triple.
 */
export function normalizeWizardClassTriple(
  organization: string,
  trialType: string | undefined,
  values: { element?: unknown; level?: unknown; section?: unknown }
): CanonicalWizardClassTriple {
  const registryId = deriveRegistryId(organization);
  const raw = {
    element: textValue(values.element),
    level: textValue(values.level),
    section: textValue(values.section),
  };
  if (!isConfiguredScentTrial(trialType)) return { registryId, ...raw };

  const sport = getScentWorkSport(registryId);
  const element = normalizeScentWorkElementLabel(sport, raw.element);
  const elementSpec = sport.elements.find(candidate => candidate.label === element);
  const levelSpec = elementSpec
    ? sport.levels.find(
        candidate =>
          elementSpec.levels.includes(candidate.key) && labelsEqual(candidate.label, raw.level)
      )
    : undefined;
  const variants = levelSpec ? (elementSpec?.variantsByLevel?.[levelSpec.key] ?? []) : [];
  const variant = variants.find(
    candidate =>
      labelsEqual(candidate.key, raw.section) || labelsEqual(candidate.label, raw.section)
  );
  const standaloneLabel =
    elementSpec && elementSpec.levels.length === 1
      ? sport.levels.find(candidate => candidate.key === elementSpec.levels[0])?.label
      : undefined;
  const canonicalLevel =
    standaloneLabel && (!raw.level || labelsEqual(raw.level, standaloneLabel))
      ? ''
      : (levelSpec?.label ?? raw.level);

  return {
    registryId,
    element,
    level: canonicalLevel,
    section: variant?.key ?? raw.section,
  };
}

export function normalizeWizardClassSelections(
  organization: string,
  trials: readonly WizardTrialSelectionLike[]
): readonly NormalizedWizardTrialSelection[] {
  return trials.map((trial, trialIndex) => ({
    trialId: trial.id ?? `trial-${trialIndex + 1}`,
    trialType: trial.trialType,
    classes: trial.classes.map((classSelection, classIndex) => ({
      className: textValue(classSelection.customizations?.className) || `Class ${classIndex + 1}`,
      templateId: classSelection.templateId ?? '',
      judgeId: classSelection.judgeId,
      triple: normalizeWizardClassTriple(
        organization,
        trial.trialType,
        classSelection.customizations ?? {}
      ),
    })),
  }));
}

export function wizardClassIdentityKey(
  trialId: string,
  triple: CanonicalWizardClassTriple
): string {
  return [triple.registryId, trialId, triple.element, triple.level, triple.section].join('|');
}

function isConfiguredScentTrial(trialType: string | undefined): boolean {
  const normalized = formatTrialTypeLabel(trialType);
  return (
    normalized === 'Scent Work' || normalized === 'Nosework' || normalized === 'Scent Detection'
  );
}

function validateSentinelValues(triple: CanonicalWizardClassTriple): string | null {
  if (!triple.element) return 'the registry element is missing';
  if (isUnresolved(triple.element)) return 'the registry element is unresolved';
  if (triple.level && isUnresolved(triple.level)) return 'the registry level is unresolved';
  if (triple.section && isUnresolved(triple.section)) return 'the registry section is unresolved';
  return null;
}

function validateAgainstRegistry(
  sport: RegistrySport,
  triple: CanonicalWizardClassTriple
): string | null {
  const element = sport.elements.find(candidate => candidate.label === triple.element);
  if (!element) return `“${triple.element}” is not configured for this registry`;

  const level = sport.levels.find(candidate => candidate.label === triple.level);
  const standalone =
    element.levels.length === 1 &&
    sport.levels.find(candidate => candidate.key === element.levels[0])?.label === element.label;
  if (!triple.level && standalone) return validateSection(element, undefined, triple.section);
  if (!level) {
    return `“${triple.level || 'a blank level'}” is not configured for this registry`;
  }
  if (!element.levels.includes(level.key)) {
    return `level “${triple.level}” is not offered for ${triple.element}`;
  }

  return validateSection(element, level.key, triple.section);
}

function validateSection(
  element: ElementSpec,
  levelKey: string | undefined,
  section: string
): string | null {
  const variants = levelKey ? (element.variantsByLevel?.[levelKey] ?? []) : [];
  const ownershipVariants = variants.filter(variant => variant.kind === 'ownership');
  if (ownershipVariants.length > 0 && !section) {
    return `a section is required for ${element.label} at this level`;
  }
  if (section && !variants.some(variant => variant.key === section)) {
    return `section “${section}” is not configured for ${element.label}`;
  }
  return null;
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function labelsEqual(left: string, right: string): boolean {
  return (
    left.trim().replace(/\s+/gu, ' ').toLocaleLowerCase() ===
    right.trim().replace(/\s+/gu, ' ').toLocaleLowerCase()
  );
}

function isUnresolved(value: string): boolean {
  return value === '' || /^unknown(?:\b|\s)/i.test(value);
}
