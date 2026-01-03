import { ExtendedAncestor } from '@/components/dogs/DogDetails/Pedigree/PedigreeAncestorAddDialog';

export const mockPedigreeData: ExtendedAncestor[] = [
  // 1. The Dog
  {
    id: '1',
    name: 'Bella',
    title: `CH Bella's Royal Heritage`,
    registration: 'UKC457801675',
    dateOfBirth: '2021-03-01',
    imageUrl: '',
    role: 'Dog',
    dob: '2021-03-01',
  },
  // 2. Sire
  {
    id: '2',
    name: 'Sire',
    title: `CH Heritage's Noble Knight`,
    registration: 'UKC457801701',
    dateOfBirth: '2019-07-10',
    imageUrl: '',
    role: 'Sire',
    dob: '2019-07-10',
  },
  // 2. Dam
  {
    id: '3',
    name: `CH Heritage's Grace Note`,
    title: `CH Heritage's Grace Note`,
    registration: 'UKC457801801',
    dateOfBirth: '2019-09-20',
    imageUrl: '',
    role: 'Dam',
    dob: '2019-09-20',
  },
  // 3. Grand Sire (Sire's Sire)
  {
    id: '4',
    name: `CH Crown's Imperial Majesty`,
    title: `CH Crown's Imperial Majesty`,
    registration: 'UKC457801900',
    dateOfBirth: '2016-04-05',
    imageUrl: '',
    role: 'Grandsire',
    dob: '2016-04-05',
  },
  // 3. Grand Dam (Sire's Dam)
  {
    id: '5',
    name: `CH Royal's Sweet Symphony`,
    title: `CH Royal's Sweet Symphony`,
    registration: 'UKC457801901',
    dateOfBirth: '2016-10-19',
    imageUrl: '',
    role: 'Granddam',
    dob: '2016-10-19',
  },
  // 3. Grand Sire (Dam's Sire)
  {
    id: '6',
    name: `CH Melody's Perfect Harmony`,
    title: `CH Melody's Perfect Harmony`,
    registration: 'UKC457801902',
    dateOfBirth: '2017-01-12',
    imageUrl: '',
    role: 'Grandsire',
    dob: '2017-01-12',
  },
  // 3. Grand Dam (Dam's Dam)
  {
    id: '7',
    name: `CH Heritage's Sweet Grace`,
    title: `CH Heritage's Sweet Grace`,
    registration: 'UKC457801903',
    dateOfBirth: '2017-06-30',
    imageUrl: '',
    role: 'Granddam',
    dob: '2017-06-30',
  },
];
