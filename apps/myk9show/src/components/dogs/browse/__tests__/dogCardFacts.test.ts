// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { BREED_NOT_SET } from '@/types/dog-types';
import { getDogCardFacts, type DogCardFactSource } from '../dogCardFacts';

const NOW = new Date(2026, 7, 22);

const registered: DogCardFactSource = {
  breed: 'Golden Retriever',
  ownerName: 'Exhibitor Exhibitor',
  dateOfBirth: '2022-08-22',
  registrations: [{ id: 'reg-1', breed: 'Golden Retriever' }],
};

describe('getDogCardFacts', () => {
  // MYK9-219: on the exhibitor roster every dog belongs to the viewer, so the
  // owner line spends a third of the card telling them their own name.
  it('omits the owner on a roster scoped to the viewer', () => {
    const facts = getDogCardFacts(registered, { showOwner: false, now: NOW });
    expect(facts.map(f => f.kind)).toEqual(['breed', 'age']);
    expect(facts.some(f => f.text === 'Exhibitor Exhibitor')).toBe(false);
  });

  it('keeps the owner where the viewer sees other people’s dogs', () => {
    const facts = getDogCardFacts(registered, { showOwner: true, now: NOW });
    expect(facts.map(f => f.kind)).toEqual(['breed', 'age', 'owner']);
    expect(facts.find(f => f.kind === 'owner')?.text).toBe('Exhibitor Exhibitor');
  });

  it('drops the owner line when no owner is recorded, even for a secretary', () => {
    const facts = getDogCardFacts({ ...registered, ownerName: undefined }, {
      showOwner: true,
      now: NOW,
    });
    expect(facts.map(f => f.kind)).toEqual(['breed', 'age']);
  });

  it('shows the dog’s breed and age, which is what the owner line was displacing', () => {
    const facts = getDogCardFacts(registered, { showOwner: false, now: NOW });
    expect(facts.find(f => f.kind === 'breed')?.text).toBe('Golden Retriever');
    expect(facts.find(f => f.kind === 'age')?.text).toBe('4 yrs old');
  });

  it('omits age rather than guessing when no date of birth is recorded', () => {
    const facts = getDogCardFacts({ ...registered, dateOfBirth: undefined }, {
      showOwner: false,
      now: NOW,
    });
    expect(facts.map(f => f.kind)).toEqual(['breed']);
  });

  // Reconciles with OpenSpec `exhibitor-ux-remediation` tasks 2.1/2.2: the card
  // routes breed through the SAME formatter as the table and the dog record,
  // and that formatter never substitutes the legacy `dogs.breed` value.
  describe('breed goes through the shared formatter', () => {
    it('never substitutes the legacy dogs.breed column for a missing registration', () => {
      const facts = getDogCardFacts(
        { breed: 'Mixed Breed', registrations: [], ownerName: 'Jane Doe' },
        { showOwner: true, now: NOW }
      );
      expect(facts.find(f => f.kind === 'breed')?.text).toBe(BREED_NOT_SET);
    });

    it('renders the shared empty state rather than dropping the line', () => {
      const facts = getDogCardFacts({ registrations: [] }, { showOwner: false, now: NOW });
      expect(facts.map(f => f.kind)).toEqual(['breed']);
      expect(facts[0]?.text).toBe(BREED_NOT_SET);
    });

    it('reads the primary registration, not the first row', () => {
      const facts = getDogCardFacts(
        {
          breed: 'Poodle',
          registrations: [
            { id: 'a', breed: 'Poodle', created_at: '2024-01-01T00:00:00Z' },
            {
              id: 'b',
              breed: 'Belgian Malinois',
              created_at: '2024-06-01T00:00:00Z',
              is_primary: true,
            },
          ],
        },
        { showOwner: false, now: NOW }
      );
      expect(facts.find(f => f.kind === 'breed')?.text).toBe('Belgian Malinois');
    });
  });
});
