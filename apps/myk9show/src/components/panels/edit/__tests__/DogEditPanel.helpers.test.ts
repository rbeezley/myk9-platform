import { describe, expect, it } from 'vitest';
import { dogFormSchema, dogToFormData, formDataToDog } from '../DogEditPanel.helpers';
import type { DogFormData, DogType } from '../DogEditPanel.types';

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

describe('dogFormSchema — registered name (MYK9-90 §5.2)', () => {
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
    // Regression: `registeredName` used to be `min(1)` unconditionally. Once
    // §5.2 stopped falling back to `dogs.name`, the field initialised to '' for
    // every unregistered dog, so EditPanelWrapper rejected EVERY save — even a
    // date-of-birth edit that has nothing to do with a registration. Adding a
    // dog with no registration is an explicitly supported flow.
    const formData = dogToFormData(unregisteredDog);
    expect(formData.registeredName).toBe('');

    const edited = { ...formData, dateOfBirth: '2021-06-05' };

    expect(dogFormSchema.safeParse(edited).success).toBe(true);
  });

  it('still requires a registered name once the dog has a registration', () => {
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

    const blanked = dogFormSchema.safeParse({ ...formData, registeredName: '   ' });
    expect(blanked.success).toBe(false);
    if (!blanked.success) {
      expect(blanked.error.issues.some(issue => issue.path[0] === 'registeredName')).toBe(true);
    }
  });

  it('still requires a call name — it is the identifier now', () => {
    const formData = dogToFormData(unregisteredDog);

    expect(dogFormSchema.safeParse({ ...formData, callName: '' }).success).toBe(false);
  });
});
