import { describe, expect, it } from 'vitest';
import { formDataToDog } from '../DogEditPanel.helpers';
import type { DogFormData } from '../DogEditPanel.types';

const baseFormData: DogFormData = {
  callName: 'Rex',
  registeredName: 'Rex the Dog',
  breed: 'Mixed Breed',
  gender: 'male',
  dateOfBirth: '2020-01-01',
  color: 'Black',
  weight: '',
  height: '',
  microchip: '',
  imageUrl: '',
  ownerId: 'person-1',
  registrations: [],
  healthRecords: {},
  notes: '',
  specialNeeds: '',
  spayedNeutered: false,
};

describe('formDataToDog', () => {
  it('does not create a new registration when editing a dog with none', () => {
    const result = formDataToDog(baseFormData);

    expect(result.registrations).toEqual([]);
  });

  it('updates the first existing registration registered name', () => {
    const result = formDataToDog({
      ...baseFormData,
      registrations: [
        {
          id: 'reg-1',
          organization: 'AKC',
          registeredName: 'Old Name',
          registrationNumber: 'SR12345678',
          breed: 'Golden Retriever',
          status: 'Active',
        },
      ],
    });

    expect(result.registrations?.[0]?.registeredName).toBe('Rex the Dog');
    expect(result.registrations?.[0]?.registrationNumber).toBe('SR12345678');
  });
});
