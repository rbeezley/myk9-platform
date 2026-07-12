import { faker } from '@faker-js/faker';
import type { Dog, Registration } from '@/types/dog-types';
import type { User } from '@/types/user-types';
import type { Show, Trial, Class as TrialClass } from '@/types/show-types';
import type { Club } from '@/types/club-types';
import { UserRole } from '@/types/auth-types';

// Set seed for consistent test data
faker.seed(123);

// Counter for unique IDs
let idCounter = 0;
const nextId = () => `test-${++idCounter}`;

// Dog Factory
export const dogFactory = {
  build: (overrides: Partial<Dog> = {}): Dog => ({
    id: nextId(),
    callName: faker.animal.dog(),
    name: `${faker.person.lastName()}'s ${faker.word.adjective()} ${faker.animal.dog()}`,
    breed: faker.helpers.arrayElement([
      'Golden Retriever',
      'German Shepherd',
      'Labrador',
      'Poodle',
    ]),
    birthDate: faker.date.between({ from: '2015-01-01', to: '2023-01-01' }).toISOString(),
    sex: faker.helpers.arrayElement(['male', 'female']) as 'male' | 'female',
    registrations: [],
    ownerId: nextId(),
    microchipNumber: faker.string.numeric(15),
    ...overrides,
  }),

  withRegistration: (dog: Dog, registration: Partial<Registration> = {}): Dog => ({
    ...dog,
    registrations: [
      ...(dog.registrations ?? []),
      {
        id: nextId(),
        organization: 'AKC',
        registeredName: dog.name,
        breed: dog.breed,
        registrationNumber: faker.string.alphanumeric(10).toUpperCase(),
        status: 'Active',
        ...registration,
      },
    ],
  }),

  createMany: (count: number, overrides: Partial<Dog> = {}): Dog[] =>
    Array.from({ length: count }, () => dogFactory.build(overrides)),
};

// User Factory
export const personFactory = {
  build: (overrides: Partial<User> = {}): User => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    return {
      id: nextId(),
      firstName,
      lastName,
      email: faker.internet.email({ firstName, lastName }).toLowerCase(),
      phone: faker.phone.number(),
      address: faker.location.streetAddress(),
      city: faker.location.city(),
      state: faker.location.state({ abbreviated: true }),
      zipCode: faker.location.zipCode('#####'),
      country: 'USA',
      roles: [UserRole.EXHIBITOR],
      clubAffiliations: [],
      createdAt: faker.date.past(),
      ...overrides,
    };
  },

  createMany: (count: number, overrides: Partial<User> = {}): User[] =>
    Array.from({ length: count }, () => personFactory.build(overrides)),
};

// Show Factory
export const showFactory = {
  build: (overrides: Partial<Show> = {}): Show => {
    const startDate =
      overrides.startDate ?? new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0];
    return {
      id: overrides.id ?? nextId(),
      name: `${faker.location.city()} Dog Show`,
      organization: 'AKC',
      startDate,
      endDate: startDate,
      location: `${faker.location.city()}, ${faker.location.state({ abbreviated: true })}`,
      status: 'published',
      events: [],
      source: 'myK9Show',
      entryOpenDate: '',
      entryCloseDate: '',
      preEntryFee: '25',
      clubId: 'club-1',
      clubName: `${faker.location.city()} Kennel Club`,
      clubAddress: '',
      clubEmail: '',
      logoUrl: '',
      coverImageUrl: '',
      accentColor: '',
      assignedJudges: [],
      trials: [],
      stats: [],
      acceptCheckPayments: false,
      acceptCashPayments: false,
      ...overrides,
    };
  },

  createMany: (count: number, overrides: Partial<Show> = {}): Show[] =>
    Array.from({ length: count }, () => showFactory.build(overrides)),
};

// Trial Factory
export const trialFactory = {
  build: (overrides: Partial<Trial> = {}): Trial => ({
    id: nextId(),
    name: `${faker.helpers.arrayElement(['Agility', 'Obedience', 'Rally', 'Scent Work'])} Trial`,
    date: faker.date.future().toISOString(),
    trialNumber: String(faker.number.int({ min: 1, max: 5 })),
    status: 'upcoming',
    classes: [],
    ...overrides,
  }),

  withClass: (trial: Trial, classData: Partial<TrialClass> = {}): Trial => ({
    ...trial,
    classes: [...(trial.classes ?? []), classFactory.build({ ...classData })],
  }),

  createMany: (count: number, overrides: Partial<Trial> = {}): Trial[] =>
    Array.from({ length: count }, () => trialFactory.build(overrides)),
};

// Class Factory
export const classFactory = {
  build: (overrides: Partial<TrialClass> = {}): TrialClass => ({
    id: nextId(),
    name: faker.helpers.arrayElement(['Novice A', 'Open B', 'Excellent']),
    maxEntries: faker.number.int({ min: 20, max: 50 }),
    entryFee: faker.number.int({ min: 25, max: 40 }),
    ...overrides,
  }),

  createMany: (count: number, overrides: Partial<TrialClass> = {}): TrialClass[] =>
    Array.from({ length: count }, () => classFactory.build(overrides)),
};

// Club Factory
export const clubFactory = {
  build: (overrides: Partial<Club> = {}): Club => ({
    id: nextId(),
    name: `${faker.location.city()} Kennel Club`,
    clubNumber: faker.string.alphanumeric(6).toUpperCase(),
    email: faker.internet.email(),
    phone: faker.phone.number(),
    website: faker.internet.url(),
    description: faker.lorem.sentence(),
    logo: faker.image.url(),
    coverImage: faker.image.url(),
    accentColor: '#0d4d4f',
    address: {
      street: faker.location.streetAddress(),
      city: faker.location.city(),
      state: faker.location.state({ abbreviated: true }),
      zipCode: faker.location.zipCode('#####'),
      country: 'USA',
    },
    founded: faker.date.past({ years: 50 }),
    clubType: faker.helpers.arrayElement([
      'specialty',
      'all-breed',
      'local',
      'regional',
      'national',
    ] as const),
    memberIds: [],
    upcomingShows: [],
    pastShows: [],
    ...overrides,
  }),

  createMany: (count: number, overrides: Partial<Club> = {}): Club[] =>
    Array.from({ length: count }, () => clubFactory.build(overrides)),
};

// User Factory (for auth testing)
export const userFactory = {
  build: (overrides: Partial<User> = {}): User => ({
    id: nextId(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    email: faker.internet.email(),
    roles: [UserRole.EXHIBITOR],
    createdAt: faker.date.past(),
    ...overrides,
  }),

  withRole: (user: User, role: UserRole): User => ({
    ...user,
    roles: [role],
  }),

  createMany: (count: number, overrides: Partial<User> = {}): User[] =>
    Array.from({ length: count }, () => userFactory.build(overrides)),
};

// Test Data Builder Pattern for complex scenarios
export class TestDataBuilder {
  private dogs: Dog[] = [];
  private people: User[] = [];
  private shows: Show[] = [];
  private clubs: Club[] = [];
  private users: User[] = [];

  addDog(overrides?: Partial<Dog>): this {
    this.dogs.push(dogFactory.build(overrides));
    return this;
  }

  addUser(overrides?: Partial<User>): this {
    this.people.push(personFactory.build(overrides));
    return this;
  }

  addShow(overrides?: Partial<Show>): this {
    this.shows.push(showFactory.build(overrides));
    return this;
  }

  addClub(overrides?: Partial<Club>): this {
    this.clubs.push(clubFactory.build(overrides));
    return this;
  }

  addAuthUser(overrides?: Partial<User>): this {
    this.users.push(userFactory.build(overrides));
    return this;
  }

  // Create a complete show scenario with dogs, people, and entries
  createShowScenario() {
    const club = clubFactory.build();
    const judge = personFactory.build({ roles: [UserRole.JUDGE] });
    const secretary = personFactory.build({ roles: [UserRole.SECRETARY] });

    const show = showFactory.build({
      clubId: club.id,
      clubName: club.name,
    });

    const trial = trialFactory.build({
      name: `${show.name} Trial`,
    });

    // Add some classes
    const classes = classFactory.createMany(3);
    trial.classes = classes;

    show.trials = [trial];

    // Create exhibitors with dogs
    const exhibitors = personFactory.createMany(5, { roles: [UserRole.EXHIBITOR] });
    const dogs = exhibitors.flatMap(person =>
      dogFactory.createMany(faker.number.int({ min: 1, max: 3 }), { ownerId: person.id })
    );

    return {
      club,
      judge,
      secretary,
      show,
      trial,
      classes,
      exhibitors,
      dogs,
    };
  }

  build() {
    return {
      dogs: this.dogs,
      people: this.people,
      shows: this.shows,
      clubs: this.clubs,
      users: this.users,
    };
  }

  reset() {
    this.dogs = [];
    this.people = [];
    this.shows = [];
    this.clubs = [];
    this.users = [];
    idCounter = 0;
    return this;
  }
}

// Export a singleton instance
export const testDataBuilder = new TestDataBuilder();

// Utility to reset all factories
export const resetFactories = () => {
  idCounter = 0;
  faker.seed(123);
  testDataBuilder.reset();
};
