/**
 * Master Mock Data - Single Source of Truth
 * 
 * This file contains all mock data with standardized descriptive IDs
 * and proper referential integrity between entities.
 * 
 * ID Format Convention:
 * - Users: person-{firstName}-{lastName} (e.g., 'person-jane-doe')
 * - Dogs: dog-{name}-{breed} (e.g., 'dog-bella-beagle')  
 * - Clubs: club-{name-slug} (e.g., 'club-border-collie-society')
 * - Shows: show-{name-slug} (e.g., 'show-spring-classic')
 */

import { User } from '@/types/user-types';
import { Dog } from '@/types/dog-types';
import { Club } from '@/types/club-types';
import { Show } from '@/types/show-types';
import { logger } from '@/services/LoggingService';

// ===== MASTER PEOPLE DATA =====
export const masterPeople: User[] = [
  {
    id: 'person-jane-doe',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane.doe@example.com',
    phone: '555-1234',
    streetAddress: '123 Main St',
    city: 'Springfield',
    state: 'IL',
    zipCode: '62704',
    profileImage: 'https://randomuser.me/api/portraits/women/1.jpg',
    dogs: [],
    judgeQualifications: [
      {
        judgeNumber: 'AKC-SW-001',
        organization: 'AKC',
        showTypes: ['Scent Work'],
        certificationDate: '2022-03-15',
        status: 'Active',
        level: 'Senior',
        disciplines: ['Scent Work'],
        dateObtained: new Date('2022-03-15'),
        expirationDate: new Date('2025-03-15')
      }
    ],
    deletedAt: undefined,
  },
  {
    id: 'person-john-smith',
    firstName: 'John',
    lastName: 'Smith',
    email: 'john.smith@example.com',
    phone: '555-2345',
    streetAddress: '456 Oak Ave',
    city: 'Shelbyville',
    state: 'IL',
    zipCode: '62705',
    profileImage: 'https://randomuser.me/api/portraits/men/1.jpg',
    dogs: [],
    judgeQualifications: [
      {
        judgeNumber: 'AKC-AG-002',
        organization: 'AKC',
        showTypes: ['Agility'],
        certificationDate: '2021-09-10',
        status: 'Active',
        level: 'Senior',
        disciplines: ['Agility'],
        dateObtained: new Date('2021-09-10'),
        expirationDate: new Date('2024-09-10')
      }
    ],
    deletedAt: undefined,
  },
  {
    id: 'person-michael-johnson',
    firstName: 'Michael',
    lastName: 'Johnson',
    email: 'michael.johnson@example.com',
    phone: '555-3456',
    streetAddress: '789 Pine St',
    city: 'Shelbyville',
    state: 'IL',
    zipCode: '62705',
    profileImage: 'https://randomuser.me/api/portraits/men/2.jpg',
    dogs: [],
    judgeQualifications: [
      {
        judgeNumber: 'AKC-SW-003',
        organization: 'AKC',
        showTypes: ['Scent Work', 'Obedience'],
        certificationDate: '2020-01-20',
        status: 'Active',
        level: 'Senior',
        disciplines: ['Scent Work', 'Obedience'],
        dateObtained: new Date('2020-01-20'),
        expirationDate: new Date('2023-01-20')
      },
      {
        judgeNumber: 'UKC-NW-001',
        organization: 'UKC',
        showTypes: ['Nosework'],
        certificationDate: '2021-06-15',
        status: 'Active',
        level: 'Apprentice',
        disciplines: ['Nosework'],
        dateObtained: new Date('2021-06-15'),
        expirationDate: new Date('2024-06-15')
      }
    ],
    deletedAt: undefined,
  },
  {
    id: 'person-sarah-garcia',
    firstName: 'Sarah',
    lastName: 'Garcia',
    email: 'sarah.garcia@example.com',
    phone: '555-4567',
    streetAddress: '101 Elm St',
    city: 'Springfield',
    state: 'IL',
    zipCode: '62704',
    profileImage: 'https://randomuser.me/api/portraits/women/2.jpg',
    dogs: [],
    deletedAt: undefined,
  },
  {
    id: 'person-david-williams',
    firstName: 'David',
    lastName: 'Williams',
    email: 'david.williams@example.com',
    phone: '555-5678',
    streetAddress: '202 Maple Dr',
    city: 'Shelbyville',
    state: 'IL',
    zipCode: '62705',
    profileImage: 'https://randomuser.me/api/portraits/men/3.jpg',
    dogs: [],
    deletedAt: undefined,
  },
  {
    id: 'person-admin-user',
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@myk9show.com',
    phone: '555-9999',
    streetAddress: '999 Developer Lane',
    city: 'Springfield',
    state: 'IL',
    zipCode: '62704',
    profileImage: 'https://randomuser.me/api/portraits/lego/1.jpg',
    dogs: [],
    deletedAt: undefined,
  },
  // Additional club admin people for testing
  {
    id: 'person-sarah-johnson',
    firstName: 'Sarah',
    lastName: 'Johnson',
    email: 'sarah.johnson@email.com',
    phone: '555-555-0123',
    streetAddress: '789 Pine Rd',
    city: 'Broken Arrow',
    state: 'OK',
    zipCode: '74012',
    profileImage: 'https://randomuser.me/api/portraits/women/3.jpg',
    dogs: [],
    deletedAt: undefined,
  },
  {
    id: 'person-mike-brown',
    firstName: 'Mike',
    lastName: 'Brown',
    email: 'mike.brown@email.com',
    phone: '555-444-7890',
    streetAddress: '321 Elm St',
    city: 'Bixby',
    state: 'OK',
    zipCode: '74008',
    profileImage: 'https://randomuser.me/api/portraits/men/4.jpg',
    dogs: [],
    deletedAt: undefined,
  },
  {
    id: 'person-emily-davis',
    firstName: 'Emily',
    lastName: 'Davis',
    email: 'emily.davis@email.com',
    phone: '555-333-2468',
    streetAddress: '654 Maple Dr',
    city: 'Owasso',
    state: 'OK',
    zipCode: '74055',
    profileImage: 'https://randomuser.me/api/portraits/women/4.jpg',
    dogs: [],
    deletedAt: undefined,
  }
];

// ===== MASTER DOGS DATA =====
export const masterDogs: Dog[] = [
  {
    id: 'dog-bella-beagle',
    name: 'Bella the Beagle',
    callName: 'Bella',
    age: 3,
    breed: 'Beagle',
    sex: 'female' as const,
    description: 'A friendly and energetic Beagle who loves to play fetch and go on long walks.',
    imageUrl: 'https://readdy.ai/api/search-image?query=A%20professional%20portrait%20of%20a%20beagle%20dog%20with%20tri-color%20coat%2C%20white%20chest%2C%20and%20expressive%20brown%20eyes%20looking%20directly%20at%20camera.%20Clean%20studio%20background%20with%20soft%20lighting%20to%20highlight%20the%20dogs%20features.%20The%20image%20has%20high%20resolution%20and%20sharp%20details%20of%20the%20dogs%20face%20and%20ears.&width=300&height=300&seq=dog1&orientation=squarish',
    registrations: [
      {
        id: 'reg-bella-beagle',
        organization: 'AKC',
        registeredName: 'Bella the Beagle',
        breed: 'Beagle',
        variety: 'Standard',
        registrationNumber: 'AKC123456',
        status: 'Active',
      }
    ],
    gender: 'Female' as const,
    ownerId: 'person-jane-doe',
    spayedNeutered: false,
    dateOfBirth: '2021-03-09',
    microchip: '123456789012345',
    color: 'Tri-color',
    height: '14',
    weight: '18',
  },
  {
    id: 'dog-lucy-lab',
    name: 'Lucy the Lab',
    callName: 'Lucy',
    age: 3,
    breed: 'Labrador Retriever',
    sex: 'female' as const,
    description: 'A friendly and energetic Labrador Retriever who loves to play fetch and go swimming.',
    imageUrl: 'https://readdy.ai/api/search-image?query=A%20professional%20portrait%20of%20a%20labrador%20retriever%20dog%20with%20chocolate%20coat%20and%20friendly%20expression%20looking%20directly%20at%20camera.%20Clean%20studio%20background%20with%20soft%20lighting%20to%20highlight%20the%20dogs%20features.%20The%20image%20has%20high%20resolution%20and%20sharp%20details%20of%20the%20dogs%20face%20and%20ears.&width=300&height=300&seq=dog6&orientation=squarish',
    registrations: [
      {
        id: 'reg-lucy-lab',
        organization: 'AKC',
        registeredName: 'Lucy the Lab',
        breed: 'Labrador Retriever',
        variety: 'Chocolate',
        registrationNumber: 'AKC234567',
        status: 'Active',
      }
    ],
    gender: 'Female' as const,
    ownerId: 'person-jane-doe',
    spayedNeutered: false,
    dateOfBirth: '2021-07-15',
    microchip: '678901234567890',
    color: 'Chocolate',
    height: '22.5',
    weight: '65',
  },
  {
    id: 'dog-max-golden',
    name: 'Max the Golden',
    callName: 'Max',
    age: 3,
    breed: 'Golden Retriever',
    sex: 'male' as const,
    description: 'A friendly and energetic Golden Retriever who loves to play fetch and go swimming.',
    imageUrl: 'https://readdy.ai/api/search-image?query=A%20professional%20portrait%20of%20a%20golden%20retriever%20dog%20with%20golden%20fur%20coat%20and%20friendly%20expression%20looking%20directly%20at%20camera.%20Clean%20studio%20background%20with%20soft%20lighting%20to%20highlight%20the%20dogs%20features.%20The%20image%20has%20high%20resolution%20and%20sharp%20details%20of%20the%20dogs%20face%20and%20ears.&width=300&height=300&seq=dog2&orientation=squarish',
    registrations: [
      {
        id: 'reg-max-golden',
        organization: 'AKC',
        registeredName: 'Max the Golden',
        breed: 'Golden Retriever',
        variety: 'Standard',
        registrationNumber: 'AKC234567',
        status: 'Active',
      }
    ],
    gender: 'Male' as const,
    ownerId: 'person-john-smith',
    spayedNeutered: false,
    dateOfBirth: '2020-05-15',
    microchip: '234567890123456',
    color: 'Golden',
    height: '24',
    weight: '70',
  },
  {
    id: 'dog-charlie-poodle',
    name: 'Charlie the Poodle',
    callName: 'Charlie',
    age: 3,
    breed: 'Poodle',
    sex: 'male' as const,
    description: 'An intelligent and elegant Standard Poodle who excels in obedience and agility.',
    imageUrl: 'https://readdy.ai/api/search-image?query=A%20professional%20portrait%20of%20a%20standard%20poodle%20with%20curly%20coat%20and%20intelligent%20expression%20looking%20directly%20at%20camera.%20Clean%20studio%20background%20with%20soft%20lighting%20to%20highlight%20the%20dogs%20features.%20The%20image%20has%20high%20resolution%20and%20sharp%20details%20of%20the%20dogs%20face%20and%20ears.&width=300&height=300&seq=dog3&orientation=squarish',
    registrations: [
      {
        id: 'reg-charlie-poodle',
        organization: 'AKC',
        registeredName: 'Charlie the Poodle',
        breed: 'Poodle',
        variety: 'Standard',
        registrationNumber: 'AKC345678',
        status: 'Active',
      }
    ],
    gender: 'Male' as const,
    ownerId: 'person-michael-johnson',
    spayedNeutered: false,
    dateOfBirth: '2020-08-22',
    microchip: '345678901234567',
    color: 'White',
    height: '22',
    weight: '45',
  },
  {
    id: 'dog-luna-border-collie',
    name: 'Luna the Border Collie',
    callName: 'Luna',
    age: 2,
    breed: 'Border Collie',
    sex: 'female' as const,
    description: 'An energetic and intelligent Border Collie who excels in agility and herding.',
    imageUrl: 'https://readdy.ai/api/search-image?query=A%20professional%20portrait%20of%20a%20border%20collie%20dog%20with%20black%20and%20white%20coat%20and%20alert%20expression%20looking%20directly%20at%20camera.%20Clean%20studio%20background%20with%20soft%20lighting%20to%20highlight%20the%20dogs%20features.%20The%20image%20has%20high%20resolution%20and%20sharp%20details%20of%20the%20dogs%20face%20and%20ears.&width=300&height=300&seq=dog4&orientation=squarish',
    registrations: [
      {
        id: 'reg-luna-border-collie',
        organization: 'AKC',
        registeredName: 'Luna the Border Collie',
        breed: 'Border Collie',
        variety: 'Standard',
        registrationNumber: 'AKC901234',
        status: 'Active',
      }
    ],
    gender: 'Female' as const,
    ownerId: 'person-sarah-garcia',
    spayedNeutered: false,
    dateOfBirth: '2021-11-15',
    microchip: '456789012345678',
    color: 'Black and White',
    height: '20',
    weight: '40',
  },
  {
    id: 'dog-cooper-corgi',
    name: 'Cooper the Corgi',
    callName: 'Cooper',
    age: 3,
    breed: 'Welsh Corgi',
    sex: 'male' as const,
    description: 'A happy and friendly Corgi',
    imageUrl: 'https://readdy.ai/api/search-image?query=A%20professional%20portrait%20of%20a%20corgi%20dog%20with%20red%20and%20white%20coat%20and%20happy%20expression%20looking%20directly%20at%20camera.%20Clean%20studio%20background%20with%20soft%20lighting%20to%20highlight%20the%20dogs%20features.%20The%20image%20has%20high%20resolution%20and%20sharp%20details%20of%20the%20dogs%20face%20and%20ears.&width=300&height=300&seq=dog5&orientation=squarish',
    registrations: [
      {
        id: 'reg-cooper-corgi',
        organization: 'AKC',
        registeredName: 'Cooper the Corgi',
        breed: 'Welsh Corgi',
        variety: 'Pembroke',
        registrationNumber: 'AKC567890',
        status: 'Active',
      }
    ],
    gender: 'Male' as const,
    ownerId: 'person-david-williams',
    spayedNeutered: false,
    dateOfBirth: '2021-03-09',
    microchip: '123456789012345',
    color: 'Red and White',
    height: '14',
    weight: '18',
  }
];

// ===== MASTER CLUBS DATA =====
export const masterClubs: Club[] = [
  {
    id: 'club-border-collie-society',
    logo: 'https://cdn-icons-png.flaticon.com/512/616/616408.png',
    name: 'Border Collie Society',
    clubNumber: 'BCS-78910',
    email: 'contact@bordercolliesociety.org',
    phone: '(555) 456-7890',
    website: 'https://www.bordercolliesociety.org',
    address: {
      street: '456 Herding Drive',
      city: 'Shepherd',
      state: 'MT',
      zipCode: '59451',
      country: 'US'
    },
    description: 'Dedicated to the promotion, preservation, and responsible breeding of Border Collies. We organize events, competitions, and educational programs for Border Collie enthusiasts.',
    founded: new Date('1985-03-15'),
    clubType: 'specialty',
    // Membership data
    memberIds: ['person-john-smith', 'person-sarah-johnson'],
    upcomingShows: [
      { id: 'show-spring-classic', name: 'Spring Classic', date: '2025-06-15', location: 'Springfield', description: 'Annual spring show.' },
      { id: 'show-summer-agility-cup', name: 'Summer Agility Cup', date: '2025-07-20', location: 'Lakeside', description: 'Agility competition for all levels.' },
    ],
    pastShows: [
      { id: 'show-winter-invitational', name: 'Winter Invitational', date: '2024-12-10', location: 'River City', description: 'End-of-year invitational.' },
    ],
  },
  {
    id: 'club-german-shepherd',
    logo: 'https://cdn-icons-png.flaticon.com/512/616/616408.png',
    name: 'German Shepherd Club',
    clubNumber: 'GSC-12345',
    email: 'info@gscclub.org',
    phone: '(555) 123-4567',
    website: 'https://www.germanshepherdclub.org',
    address: {
      street: '789 Shepherd Lane',
      city: 'Berlin',
      state: 'Berlin',
      zipCode: '10115',
      country: 'DE'
    },
    description: 'A club for German Shepherd enthusiasts and breeders.',
    founded: new Date('1978-09-20'),
    clubType: 'specialty',
    // Membership data
    memberIds: ['person-mike-brown'],
    upcomingShows: [],
    pastShows: [],
  },
  {
    id: 'club-golden-retriever-association',
    logo: 'https://cdn-icons-png.flaticon.com/512/616/616408.png',
    name: 'Golden Retriever Association',
    clubNumber: 'GRA-45678',
    email: 'contact@goldenclub.org',
    phone: '(555) 987-6543',
    website: 'https://www.goldenretrieverassoc.org',
    address: {
      street: '321 Golden Street',
      city: 'Denver',
      state: 'CO',
      zipCode: '80202',
      country: 'US'
    },
    description: 'Promoting the Golden Retriever breed through events and education.',
    founded: new Date('1992-11-08'),
    clubType: 'specialty',
    // Membership data
    memberIds: ['person-emily-davis', 'person-admin-user'],
    upcomingShows: [],
    pastShows: [],
  },
];

// ===== MASTER SHOWS DATA =====
export const masterShows: Show[] = [
  {
    id: 'show-spring-classic',
    name: 'Spring Classic',
    type: 'Scent Work',
    startDate: '2025-06-15',
    endDate: '2025-06-15',
    location: 'Springfield',
    status: 'Upcoming',
    events: ['Scent Work Trial', 'Handler Discrimination Test'],
    source: 'myK9Show' as const,
    entryOpenDate: '2025-05-01',
    entryCloseDate: '2025-06-10',
    preEntryFee: '$25',
    dayOfShowFee: '$30',
    clubId: 'club-border-collie-society',
    clubName: 'Border Collie Society',
    clubAddress: '456 Herding Drive, Shepherd, MT 59451',
    clubEmail: 'contact@bordercolliesociety.org',
    chairman: 'Sarah Johnson',
    secretary: 'Sarah Johnson',
    chiefSteward: 'Mike Brown',
    assignedJudges: [
      {
        judgeId: 'person-jane-doe',
        judgeName: 'Jane Doe',
        assignedDate: '2025-05-01',
        availableStartTime: 'Full Day',
        availableEndTime: 'Full Day'
      },
      {
        judgeId: 'person-michael-johnson',
        judgeName: 'Michael Johnson',
        assignedDate: '2025-05-01',
        availableStartTime: 'Full Day',
        availableEndTime: 'Full Day'
      }
    ],
    stats: [],
    trials: []
  },
  {
    id: 'show-summer-agility-cup',
    name: 'Summer Agility Cup',
    type: 'Agility',
    startDate: '2025-07-20',
    endDate: '2025-07-20',
    location: 'Lakeside',
    status: 'Upcoming',
    events: ['Standard Agility', 'Jumpers with Weaves'],
    source: 'myK9Show' as const,
    entryOpenDate: '2025-06-15',
    entryCloseDate: '2025-07-15',
    preEntryFee: '$30',
    dayOfShowFee: '$35',
    clubId: 'club-border-collie-society',
    clubName: 'Border Collie Society',
    clubAddress: '456 Herding Drive, Shepherd, MT 59451',
    clubEmail: 'contact@bordercolliesociety.org',
    chairman: 'Sarah Johnson',
    secretary: 'Sarah Johnson',
    chiefSteward: 'Mike Brown',
    assignedJudges: [
      {
        judgeId: 'person-john-smith',
        judgeName: 'John Smith',
        assignedDate: '2025-06-15',
        availableStartTime: 'Full Day',
        availableEndTime: 'Full Day'
      }
    ],
    stats: [],
    trials: []
  },
  {
    id: 'show-winter-invitational',
    name: 'Winter Invitational',
    type: 'Scent Work',
    startDate: '2024-12-10',
    endDate: '2024-12-10',
    location: 'River City',
    status: 'Completed',
    events: ['Scent Work Trial'],
    source: 'myK9Show' as const,
    entryOpenDate: '2024-11-01',
    entryCloseDate: '2024-12-05',
    preEntryFee: '$25',
    dayOfShowFee: '$30',
    clubId: 'club-border-collie-society',
    clubName: 'Border Collie Society',
    clubAddress: '456 Herding Drive, Shepherd, MT 59451',
    clubEmail: 'contact@bordercolliesociety.org',
    chairman: 'Sarah Johnson',
    secretary: 'Sarah Johnson',
    chiefSteward: 'Mike Brown',
    assignedJudges: [
      {
        judgeId: 'person-michael-johnson',
        judgeName: 'Michael Johnson',
        assignedDate: '2024-11-01',
        availableStartTime: 'Full Day',
        availableEndTime: 'Full Day'
      }
    ],
    stats: [],
    trials: []
  }
];

// ===== EXPORT ALL DATA =====
export const masterMockData = {
  people: masterPeople,
  dogs: masterDogs,
  clubs: masterClubs,
  shows: masterShows
};

// ===== HELPER FUNCTIONS =====

/**
 * Get person by ID with error handling
 */
export const getPerson = (id: string): User | undefined => {
  return masterPeople.find(person => person.id === id);
};

/**
 * Get dogs owned by a specific person
 */
export const getPersonDogs = (personId: string) => {
  return masterDogs.filter(dog => dog.ownerId === personId);
};

/**
 * Get club members with full person data
 */
export const getClubMembers = (clubId: string) => {
  const club = masterClubs.find(c => c.id === clubId);
  if (!club || !club.memberIds) return [];
  
  return club.memberIds.map(id => getPerson(id)).filter(Boolean) as User[];
};

/**
 * Get club admin with full person data
 */
export const getClubAdmin = (): User | undefined => {
  // This function is deprecated. Use ClubAdminService.getClubAdmins() for RBAC-based admin retrieval.
  logger.warn('getClubAdmin is deprecated. Use ClubAdminService.getClubAdmins() instead.', 'app', {});
  return undefined;
};