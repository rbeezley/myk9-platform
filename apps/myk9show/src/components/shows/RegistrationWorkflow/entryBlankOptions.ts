import type { BuildEntryBlankOptions } from '@/features/heritage/entry-blank/buildEntryBlankProps';
import type { EntryBlankProps } from '@/features/heritage/entry-blank/types';
import type { EntrySubmissionOutcome } from '@/services/database/entries';
import type { HandlerInfo, PaymentMethod } from '@/types/show-registration-types';
import { makeHandlerKey } from '@/types/show-registration-types';

interface ShowSource {
  id: string;
  name: string;
  organization?: string | null;
  startDate: string;
  endDate: string;
  entryCloseDate?: string | null;
  preEntryFee?: string | number | null;
  clubName?: string | null;
  clubEmail?: string | null;
}

interface TrialSource {
  id: string;
  showId: string;
  trialDate: string;
  trialNumber?: string | null | undefined;
  order?: string | null | undefined;
  registryId?: string | null | undefined;
  timezone?: string | null | undefined;
}

interface ClassSource {
  id: string;
  trialId: string;
  className?: string | null | undefined;
  element?: string | null | undefined;
  level?: string | null | undefined;
  section?: string | null | undefined;
  judge?: string | null | undefined;
}

interface RegistrationSource {
  id: string;
  organization?: string | null | undefined;
  registrationNumber?: string | null | undefined;
  registeredName?: string | null | undefined;
  breed?: string | null | undefined;
  variety?: string | null | undefined;
  isPrimary?: boolean | null | undefined;
  createdAt?: string | null | undefined;
  status?: string | null | undefined;
}

interface DogSource {
  id: string;
  name?: string | null | undefined;
  callName?: string | null | undefined;
  ownerId?: string | null | undefined;
  ownerName?: string | null | undefined;
  color?: string | null | undefined;
  sex?: string | null | undefined;
  dateOfBirth?: string | null | undefined;
  registrations?: readonly RegistrationSource[] | null | undefined;
}

interface PersonSource {
  id: string;
  firstName?: string | null | undefined;
  lastName?: string | null | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  address?: string | null | undefined;
  streetAddress?: string | null | undefined;
  city?: string | null | undefined;
  state?: string | null | undefined;
  zipCode?: string | null | undefined;
}

export interface RegistrationEntryBlankDownload {
  entryId: string;
  label: string;
  options: BuildEntryBlankOptions;
}

export interface UnavailableRegistrationEntryBlank {
  key: string;
  reason: string;
}

interface BuildRegistrationEntryBlankDownloadsInput {
  show: ShowSource | null | undefined;
  trials: readonly TrialSource[];
  classes: readonly ClassSource[];
  dogs: readonly DogSource[];
  people: readonly PersonSource[];
  outcomes: readonly EntrySubmissionOutcome[] | undefined;
  handlerAssignments: Readonly<Record<string, HandlerInfo>>;
  paymentMethod: PaymentMethod | undefined;
}

function parseOptionalNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function entryBlankPaymentMethod(
  method: PaymentMethod | undefined
): EntryBlankProps['fees']['paymentMethod'] {
  if (method === 'check') return 'check';
  if (method === 'credit_card') return 'online';
  return null;
}

function displayClassName(classItem: ClassSource): string {
  const parts = [classItem.element, classItem.level, classItem.section].filter(Boolean);
  return classItem.className || parts.join(' ') || 'Entry';
}

function splitDisplayName(name: string | null | undefined): {
  first_name: string | null;
  last_name: string | null;
} {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: null, last_name: null };
  if (parts.length === 1) return { first_name: parts[0] ?? null, last_name: null };
  return {
    first_name: parts.slice(0, -1).join(' '),
    last_name: parts[parts.length - 1] ?? null,
  };
}

function buildPerson(
  personId: string | null | undefined,
  fallbackName: string | null | undefined,
  people: readonly PersonSource[]
): NonNullable<BuildEntryBlankOptions['handler']> {
  const person = people.find(candidate => candidate.id === personId);
  const fallback = splitDisplayName(fallbackName);

  return {
    first_name: person?.firstName ?? fallback.first_name,
    last_name: person?.lastName ?? fallback.last_name,
    email: person?.email ?? null,
    phone: person?.phone ?? null,
    address: person?.streetAddress ?? person?.address ?? null,
    city: person?.city ?? null,
    state: person?.state ?? null,
    zip_code: person?.zipCode ?? null,
  };
}

function buildEntryPeople(
  dog: DogSource,
  classId: string,
  people: readonly PersonSource[],
  assignments: Readonly<Record<string, HandlerInfo>>
): Pick<BuildEntryBlankOptions, 'owner' | 'handler'> {
  const assignment = assignments[makeHandlerKey(dog.id, classId)];
  const owner = buildPerson(dog.ownerId, dog.ownerName, people);

  if (!assignment || assignment.isOwner) {
    return { owner };
  }

  return {
    owner,
    handler: buildPerson(assignment.handlerId, assignment.handlerName, people),
  };
}

function isAssignedJudge(name: string | null | undefined): name is string {
  const normalized = name?.trim().toLowerCase();
  return Boolean(normalized && normalized !== 'tbd' && normalized !== 'unknown judge');
}

function trialJudgeName(
  trialId: string,
  selectedClass: ClassSource,
  classes: readonly ClassSource[]
): string | null {
  if (selectedClass.trialId === trialId && isAssignedJudge(selectedClass.judge)) {
    return selectedClass.judge.trim();
  }

  const candidates = classes.filter(classItem => classItem.trialId === trialId);
  const names = candidates.map(classItem => classItem.judge?.trim()).filter(isAssignedJudge);
  return [...new Set(names)].join(' / ') || null;
}

export function buildRegistrationEntryBlankDownloads(
  input: BuildRegistrationEntryBlankDownloadsInput
): {
  downloads: RegistrationEntryBlankDownload[];
  unavailable: UnavailableRegistrationEntryBlank[];
} {
  const downloads: RegistrationEntryBlankDownload[] = [];
  const unavailable: UnavailableRegistrationEntryBlank[] = [];
  const createdOutcomes = (input.outcomes ?? []).filter(outcome => outcome.outcome === 'created');

  for (const outcome of createdOutcomes) {
    const key = outcome.entryId ?? `${outcome.dogId}|${outcome.classId}`;
    const currentShow = input.show;
    const dog = input.dogs.find(candidate => candidate.id === outcome.dogId);
    const selectedClass = input.classes.find(candidate => candidate.id === outcome.classId);
    const trial = selectedClass
      ? input.trials.find(candidate => candidate.id === selectedClass.trialId)
      : undefined;

    if (!currentShow || !dog || !selectedClass || !trial || !outcome.entryId) {
      unavailable.push({
        key,
        reason: 'We could not assemble this entry blank from the completed registration.',
      });
      continue;
    }

    const showTrials = input.trials.filter(candidate => candidate.showId === currentShow.id);
    const showTrialIds = new Set(showTrials.map(candidate => candidate.id));
    const showClasses = input.classes.filter(candidate => showTrialIds.has(candidate.trialId));
    const selectedJudge = trialJudgeName(trial.id, selectedClass, showClasses);

    if (!selectedJudge) {
      unavailable.push({
        key,
        reason: `${displayClassName(selectedClass)} needs an assigned judge before its entry blank can be generated.`,
      });
      continue;
    }

    const judges = showTrials.flatMap(showTrial => {
      const judgeName = trialJudgeName(showTrial.id, selectedClass, showClasses);
      return judgeName ? [{ trial_id: showTrial.id, judgeName }] : [];
    });

    downloads.push({
      entryId: outcome.entryId,
      label: `${dog.callName || dog.name || 'Dog'} — ${displayClassName(selectedClass)}`,
      options: {
        show: {
          name: currentShow.name,
          start_date: currentShow.startDate,
          end_date: currentShow.endDate,
          entry_close_date: currentShow.entryCloseDate ?? null,
          pre_entry_fee: parseOptionalNumber(currentShow.preEntryFee),
          organization: currentShow.organization ?? null,
        },
        trials: showTrials.map((showTrial, index) => ({
          id: showTrial.id,
          date: showTrial.trialDate,
          trial_number: showTrial.trialNumber ?? null,
          display_order: parseOptionalNumber(showTrial.order) ?? index + 1,
          registry_id: showTrial.registryId ?? null,
          timezone: showTrial.timezone ?? null,
        })),
        classes: showClasses.map(classItem => ({
          id: classItem.id,
          trial_id: classItem.trialId,
          level: classItem.level ?? null,
          element: classItem.element ?? null,
          section: classItem.section ?? null,
          name: classItem.className ?? null,
        })),
        judges,
        club: { name: currentShow.clubName || currentShow.name },
        secretary: {
          email: currentShow.clubEmail ?? null,
        },
        entry: {
          trial_id: trial.id,
          class_id: selectedClass.id,
          entry_fee: outcome.feeCents / 100,
          payment_method: entryBlankPaymentMethod(input.paymentMethod),
        },
        dog: {
          name: dog.name ?? null,
          call_name: dog.callName ?? null,
          color: dog.color ?? null,
          sex: dog.sex ?? null,
          date_of_birth: dog.dateOfBirth ?? null,
          registrations: (dog.registrations ?? []).map(registration => ({
            id: registration.id,
            organization: registration.organization ?? null,
            registration_number: registration.registrationNumber ?? null,
            registered_name: registration.registeredName ?? null,
            breed: registration.breed ?? null,
            variety: registration.variety ?? null,
            is_primary: registration.isPrimary ?? null,
            created_at: registration.createdAt ?? null,
          })),
        },
        ...buildEntryPeople(dog, selectedClass.id, input.people, input.handlerAssignments),
      },
    });
  }

  return { downloads, unavailable };
}
