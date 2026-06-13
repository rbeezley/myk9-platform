import { supabase } from '../supabaseClient';
import {
  replicatedArmbandsTable,
  type ReplicatedArmband,
} from '@/services/replication/ReplicatedArmbandsTable';
import {
  replicatedClassesTable,
  type ReplicatedClass,
} from '@/services/replication/ReplicatedClassesTable';
import {
  replicatedDogsTable,
  type ReplicatedDog,
} from '@/services/replication/ReplicatedDogsTable';
import {
  replicatedEntriesTable,
  type ReplicatedEntry,
} from '@/services/replication/ReplicatedEntriesTable';
import { buildMapFromArray } from '../_shared/maps';
import type { SecretaryEntry } from './secretaryTypes';

interface SecretaryPerson {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface SecretaryEnrollment {
  id: string;
  confirmation_number: string;
  payment_status: string | null;
  payment_reference: string | null;
  total_amount: number | null;
  paid_amount: number | null;
  refund_amount: number | null;
  refund_notes: string | null;
  refunded_at: string | null;
}

interface SecretaryEntryRelations {
  dogsMap: ReadonlyMap<string, ReplicatedDog>;
  classesMap: ReadonlyMap<string, ReplicatedClass>;
  armbandsByEntryId: ReadonlyMap<string, ReplicatedArmband>;
  armbandsByDogId: ReadonlyMap<string, ReplicatedArmband>;
  peopleMap: ReadonlyMap<string, SecretaryPerson>;
  enrollmentsMap: ReadonlyMap<string, SecretaryEnrollment>;
}

type SecretaryDog = Pick<ReplicatedDog, 'id' | 'name' | 'callName' | 'breed' | 'ownerId'>;

function isNotDeleted(row: {
  deletedAt?: string | null | undefined;
  deleted_at?: string | null | undefined;
}) {
  return !row.deletedAt && !row.deleted_at;
}

function stringFrom(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberFrom(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function booleanFrom(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function replicatedField(entry: ReplicatedEntry, camel: string, snake: string): unknown {
  const record = entry as unknown as Record<string, unknown>;
  return record[camel] ?? record[snake] ?? null;
}

function replicatedClassNumber(cls: ReplicatedClass): string | null {
  const record = cls as unknown as Record<string, unknown>;
  return stringFrom(record.classNumber ?? record.class_number);
}

function fallbackDogFromEntry(entry: ReplicatedEntry, dogId: string): SecretaryDog | null {
  const callName = entry.dogCallName ?? entry.dog_call_name ?? null;
  const breed = entry.dogBreed ?? entry.dog_breed ?? null;
  if (!callName && !breed) return null;

  return {
    id: dogId,
    name: callName ?? 'Unknown Dog',
    ...(callName ? { callName } : {}),
    breed: breed ?? 'Unknown',
  };
}

async function loadSecretaryPeopleMap(
  entries: ReplicatedEntry[],
  dogs: ReplicatedDog[]
): Promise<Map<string, SecretaryPerson>> {
  const ids = [
    ...entries.map(e => e.handlerId).filter(Boolean),
    ...dogs.map(d => d.ownerId).filter(Boolean),
  ];
  const uniqueIds = [...new Set(ids)] as string[];
  if (uniqueIds.length === 0) return new Map();

  try {
    const { data, error } = await supabase
      .from('people')
      .select('id, first_name, last_name, email')
      .in('id', uniqueIds);

    if (error || !data) return new Map();
    return new Map((data as SecretaryPerson[]).map(person => [person.id, person]));
  } catch {
    return new Map();
  }
}

async function loadSecretaryEnrollmentsMap(
  entries: ReplicatedEntry[]
): Promise<Map<string, SecretaryEnrollment>> {
  const uniqueIds = [...new Set(entries.map(e => e.registrationId).filter(Boolean))] as string[];
  if (uniqueIds.length === 0) return new Map();

  try {
    const { data, error } = await supabase
      .from('enrollments')
      .select(
        'id, confirmation_number, payment_status, payment_reference, total_amount, paid_amount, refund_amount, refund_notes, refunded_at'
      )
      .in('id', uniqueIds);

    if (error || !data) return new Map();
    return new Map((data as SecretaryEnrollment[]).map(enrollment => [enrollment.id, enrollment]));
  } catch {
    return new Map();
  }
}

function toSecretaryEntry(
  entry: ReplicatedEntry,
  {
    dogsMap,
    classesMap,
    armbandsByEntryId,
    armbandsByDogId,
    peopleMap,
    enrollmentsMap,
  }: SecretaryEntryRelations
): SecretaryEntry {
  const dogId = entry.dogId ?? null;
  const classId = entry.classId ?? null;
  const handlerId = entry.handlerId ?? null;
  const dog = dogId ? (dogsMap.get(dogId) ?? fallbackDogFromEntry(entry, dogId)) : null;
  const cls = classId ? (classesMap.get(classId) ?? null) : null;
  const ownerId = dog?.ownerId ?? null;
  const owner = ownerId ? (peopleMap.get(ownerId) ?? null) : null;
  const handler = handlerId ? (peopleMap.get(handlerId) ?? null) : null;
  const enrollment = entry.registrationId
    ? (enrollmentsMap.get(entry.registrationId) ?? null)
    : null;
  const armband =
    entry.armband ??
    armbandsByEntryId.get(entry.id)?.armbandNumber ??
    (dogId ? armbandsByDogId.get(dogId)?.armbandNumber : undefined) ??
    null;
  const createdAt =
    stringFrom(replicatedField(entry, 'createdAt', 'created_at')) ?? entry.submittedAt ?? null;
  const updatedAt =
    entry.updated_at ?? stringFrom(replicatedField(entry, 'updatedAt', 'updated_at'));

  return {
    id: entry.id,
    dog_id: dogId,
    class_id: classId,
    trial_id: entry.trialId ?? entry.trial_id ?? null,
    show_id: entry.showId ?? null,
    handler: entry.handler ?? null,
    handler_id: handlerId,
    payment_status: entry.paymentStatus ?? null,
    entry_status: entry.entryStatus ?? entry.entry_status ?? entry.status ?? null,
    entry_fee: entry.entryFee ?? null,
    submitted_at: entry.submittedAt ?? null,
    created_at: createdAt,
    updated_at: updatedAt,
    armband,
    special_requests: entry.specialRequests ?? entry.special_requests ?? null,
    jump_height: entry.jumpHeight ?? null,
    run_order: entry.runOrder ?? null,
    is_in_ring: booleanFrom(replicatedField(entry, 'isInRing', 'is_in_ring')),
    check_in_status: entry.checkInStatus ?? entry.check_in_status ?? null,
    withdrawal_reason: entry.withdrawalReason ?? entry.withdrawal_reason ?? null,
    payment_method: entry.paymentMethod ?? null,
    refund_amount: numberFrom(replicatedField(entry, 'refundAmount', 'refund_amount')),
    refunded_at: stringFrom(replicatedField(entry, 'refundedAt', 'refunded_at')),
    stripe_payment_intent_id: stringFrom(
      replicatedField(entry, 'stripePaymentIntentId', 'stripe_payment_intent_id')
    ),
    registration_id: entry.registrationId ?? null,
    registration: enrollment
      ? {
          id: enrollment.id,
          confirmation_number: enrollment.confirmation_number,
          payment_status: enrollment.payment_status,
          payment_reference: enrollment.payment_reference,
          total_amount: enrollment.total_amount,
          paid_amount: enrollment.paid_amount,
          refund_amount: enrollment.refund_amount,
          refund_notes: enrollment.refund_notes,
          refunded_at: enrollment.refunded_at,
        }
      : null,
    handler_person: handler
      ? {
          id: handler.id,
          first_name: handler.first_name,
          last_name: handler.last_name,
        }
      : null,
    dog: dog
      ? {
          id: dog.id,
          name: dog.name,
          call_name: dog.callName ?? null,
          breed: dog.breed ?? null,
          owner: ownerId
            ? {
                id: ownerId,
                first_name: owner?.first_name ?? null,
                last_name: owner?.last_name ?? null,
                email: owner?.email ?? null,
              }
            : null,
        }
      : null,
    class: cls
      ? {
          id: cls.id,
          name: cls.name,
          class_number: replicatedClassNumber(cls),
          max_entries: cls.maxEntries ?? null,
        }
      : null,
  };
}

export async function getReplicatedSecretaryEntriesForShow(showId: string) {
  const entries = (await replicatedEntriesTable.getEntriesByShow(showId)).filter(isNotDeleted);
  const [dogs, classes, armbands] = await Promise.all([
    replicatedDogsTable.getAllDogs(),
    replicatedClassesTable.getAll(),
    replicatedArmbandsTable.getByShow(showId),
  ]);
  const dogsMap = buildMapFromArray(dogs.filter(isNotDeleted), d => d.id);
  const classesMap = buildMapFromArray(classes.filter(isNotDeleted), c => c.id);
  const assignedArmbands = armbands.filter(a => a.isAvailable !== true);
  const armbandsByEntryId = buildMapFromArray(
    assignedArmbands.filter(a => a.entryId),
    a => a.entryId as string
  );
  const armbandsByDogId = buildMapFromArray(
    assignedArmbands.filter(a => a.dogId),
    a => a.dogId as string
  );
  const [peopleMap, enrollmentsMap] = await Promise.all([
    loadSecretaryPeopleMap(entries, dogs),
    loadSecretaryEnrollmentsMap(entries),
  ]);
  const data = entries
    .map(entry =>
      toSecretaryEntry(entry, {
        dogsMap,
        classesMap,
        armbandsByEntryId,
        armbandsByDogId,
        peopleMap,
        enrollmentsMap,
      })
    )
    .sort((a, b) =>
      (a.created_at ?? a.submitted_at ?? a.id).localeCompare(b.created_at ?? b.submitted_at ?? b.id)
    );

  return { data, error: null };
}
