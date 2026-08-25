import { describe, expect, it } from 'vitest';
import { dogFormSchema, dogToFormData, formDataToDog } from '../DogEditPanel.helpers';
import type { DogFormData, DogType } from '../DogEditPanel.types';

const baseFormData: DogFormData = {
  callName: 'Rex',
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

  it('leaves registration identity untouched; registration editors own those fields', () => {
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

    expect(result.registrations?.[0]?.registeredName).toBe('Old Name');
    expect(result.registrations?.[0]?.registrationNumber).toBe('SR12345678');
    expect(result).not.toHaveProperty('breed');
  });
});

describe('dogFormSchema — dog identity fields', () => {
  const unregisteredDog = {
    id: 'dog-1',
    callName: 'Tera',
    name: null,
    breed: '',
    sex: 'female',
    dateOfBirth: '2021-06-04',
    ownerId: 'person-1',
    registrations: [],
  } as unknown as Partial<DogType>;

  it('lets an unregistered dog be saved after changing an unrelated field', () => {
    const formData = dogToFormData(unregisteredDog);

    const edited = { ...formData, dateOfBirth: '2021-06-05' };

    expect(dogFormSchema.safeParse(edited).success).toBe(true);
  });

  it('does not validate registered-name data on the base dog form', () => {
    const formData = dogToFormData({
      ...unregisteredDog,
      registrations: [
        {
          id: 'reg-1',
          organization: 'AKC',
          registeredName: 'Maia TeraByte Van Neerland',
          registrationNumber: 'DN61191906',
          breed: 'Border Collie',
          status: 'Active',
        },
      ],
    } as unknown as Partial<DogType>);

    expect(dogFormSchema.safeParse(formData).success).toBe(true);
    expect(dogFormSchema.safeParse({ ...formData, registrations: [{ ...formData.registrations[0], registeredName: '' }] }).success).toBe(true);
  });

  it('still requires a call name — it is the identifier now', () => {
    const formData = dogToFormData(unregisteredDog);

    expect(dogFormSchema.safeParse({ ...formData, callName: '' }).success).toBe(false);
  });
});
