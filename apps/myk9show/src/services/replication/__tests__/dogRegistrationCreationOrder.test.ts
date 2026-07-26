import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ReplicatedDogRegistrationsTable,
  replicatedDogRegistrationsTable,
} from '../ReplicatedDogRegistrationsTable';
import { resolveDogIdentity } from '@/features/dogs/identity';

/**
 * MYK9-90 review round 3, finding 4 — REALISTIC-DATA proof.
 *
 * The round-2 fix added a `created_at` passthrough in `toSupabaseRow` guarded on
 * `registration.createdAt`. Nothing set that field, so the conditional never
 * fired: dead code that any test building its own fixture would have "passed".
 *
 * These tests therefore construct registrations through the ACTUAL local
 * creation methods rather than by hand, and only `set`/`queueMutation` (the
 * IndexedDB boundary) are stubbed. If `createdAt` is not assigned in production
 * code, these fail.
 */
describe('locally created registrations carry a usable creation order', () => {
  let setSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const proto = ReplicatedDogRegistrationsTable.prototype as unknown as Record<string, () => Promise<void>>;
    setSpy = vi.spyOn(proto, 'set').mockResolvedValue(undefined);
    vi.spyOn(proto, 'queueMutation').mockResolvedValue(undefined);

    // Force the UUIDs to sort in the OPPOSITE order to creation, so a resolver
    // that falls back to the `id` tiebreak gives the wrong answer and the test
    // can tell the difference.
    let n = 0;
    const descending = [
      'zzzzzzzz-0000-4000-8000-000000000000',
      'aaaaaaaa-0000-4000-8000-000000000000',
    ];
    vi.spyOn(crypto, 'randomUUID').mockImplementation(
      () =>
        descending[n++ % descending.length] as `${string}-${string}-${string}-${string}-${string}`
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it('assigns createdAt through the real creation path', async () => {
    const saved = await replicatedDogRegistrationsTable.createLocalRegistrationsForDog('dog-1', [
      { organization: 'AKC', number: 'DN61191906', type: 'Belgian Malinois', status: 'active' },
    ]);

    expect(saved[0]!.createdAt).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(saved[0]!.createdAt!))).toBe(false);
    expect(setSpy).toHaveBeenCalled();
  });

  it('emits created_at on the Supabase row built from a real registration', async () => {
    const [registration] = await replicatedDogRegistrationsTable.createLocalRegistrationsForDog(
      'dog-1',
      [{ organization: 'AKC', number: 'DN61191906', type: 'Belgian Malinois', status: 'active' }]
    );

    const row = replicatedDogRegistrationsTable.toSupabaseRow(registration!);
    expect(row).toHaveProperty('created_at');
    expect(row.created_at).toBe(registration!.createdAt);
  });

  it('resolves a multi-registration offline dog by creation order, not by UUID', async () => {
    const saved = await replicatedDogRegistrationsTable.createLocalRegistrationsForDog('dog-1', [
      // Entered FIRST — must stay primary. Its UUID sorts LAST.
      { organization: 'AKC', number: 'DN61191906', type: 'Belgian Malinois', status: 'active' },
      // Entered second. Its UUID sorts FIRST, so an id-ordered resolver picks it.
      { organization: 'UKC', number: 'P935-254', type: 'Belgian Shepherd Dog', status: 'active' },
    ]);

    expect(saved[0]!.id > saved[1]!.id).toBe(true); // ids really do disagree with order

    const rows = saved.map(r => replicatedDogRegistrationsTable.toSupabaseRow(r));
    expect(resolveDogIdentity(rows).breed).toBe('Belgian Malinois');
  });

  it('gives each registration in a batch a DISTINCT timestamp', async () => {
    // A single `new Date()` for the whole batch ties, and a tie sends the
    // resolver straight back to the random-UUID tiebreak this test exists to
    // rule out.
    const saved = await replicatedDogRegistrationsTable.createLocalRegistrationsForDog('dog-1', [
      { organization: 'AKC', number: 'A', type: 'Belgian Malinois', status: 'active' },
      { organization: 'UKC', number: 'B', type: 'Belgian Shepherd Dog', status: 'active' },
    ]);

    expect(saved[0]!.createdAt).not.toBe(saved[1]!.createdAt);
    expect(Date.parse(saved[0]!.createdAt!)).toBeLessThan(Date.parse(saved[1]!.createdAt!));
  });

  it('applies the same ordering to the queued (server-bound) creation path', async () => {
    const saved = await replicatedDogRegistrationsTable.createRegistrationsForDog('dog-1', [
      { organization: 'AKC', number: 'DN61191906', type: 'Belgian Malinois', status: 'active' },
      { organization: 'UKC', number: 'P935-254', type: 'Belgian Shepherd Dog', status: 'active' },
    ]);

    const rows = saved.map(r => replicatedDogRegistrationsTable.toSupabaseRow(r));
    expect(resolveDogIdentity(rows).breed).toBe('Belgian Malinois');
  });
});
