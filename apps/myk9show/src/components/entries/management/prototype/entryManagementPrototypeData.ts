// PROTOTYPE — throwaway fixture data for the Entry Management design review.

export type PrototypeQueue = 'review' | 'missing' | 'payment' | 'all';

export interface PrototypeEntry {
  id: string;
  trial: string;
  trialDate: string;
  className: string;
  handler: string;
  status: 'Needs review' | 'Accepted' | 'Missing information' | 'Waitlist';
}

export interface PrototypeDog {
  id: string;
  name: string;
  armband: string | null;
  entries: PrototypeEntry[];
}

export interface PrototypeRegistration {
  id: string;
  exhibitor: string;
  email: string;
  confirmation: string;
  submitted: string;
  queue: Exclude<PrototypeQueue, 'all'> | 'accepted';
  reviewLabel: string;
  paymentLabel: string;
  amountDue: number;
  primaryAction: string;
  dogs: PrototypeDog[];
}

export const PROTOTYPE_QUEUE_COUNTS: Record<PrototypeQueue, number> = {
  review: 5,
  missing: 2,
  payment: 3,
  all: 243,
};

export const PROTOTYPE_REGISTRATIONS: PrototypeRegistration[] = [
  {
    id: 'registration-1048',
    exhibitor: 'Alice Martin',
    email: 'alice@example.com',
    confirmation: 'SW-1048',
    submitted: 'Jul 12 · 8:42 AM',
    queue: 'review',
    reviewLabel: 'Needs review',
    paymentLabel: 'Paid online',
    amountDue: 0,
    primaryAction: 'Review registration',
    dogs: [
      {
        id: 'dog-poppy',
        name: 'Poppy',
        armband: '208',
        entries: [
          {
            id: 'entry-poppy-1',
            trial: 'Trial 1',
            trialDate: 'Sun, Jul 19',
            className: 'Container Novice A',
            handler: 'Alice Martin',
            status: 'Needs review',
          },
          {
            id: 'entry-poppy-2',
            trial: 'Trial 2',
            trialDate: 'Sun, Jul 19',
            className: 'Interior Novice A',
            handler: 'Alice Martin',
            status: 'Needs review',
          },
        ],
      },
      {
        id: 'dog-scout',
        name: 'Scout',
        armband: '219',
        entries: [
          {
            id: 'entry-scout-1',
            trial: 'Trial 1',
            trialDate: 'Sun, Jul 19',
            className: 'Buried Advanced',
            handler: 'Jordan Lee',
            status: 'Needs review',
          },
          {
            id: 'entry-scout-2',
            trial: 'Trial 2',
            trialDate: 'Sun, Jul 19',
            className: 'Exterior Advanced',
            handler: 'Alice Martin',
            status: 'Accepted',
          },
        ],
      },
    ],
  },
  {
    id: 'registration-1041',
    exhibitor: 'Marcus Chen',
    email: 'marcus@example.com',
    confirmation: 'SW-1041',
    submitted: 'Jul 12 · 10:18 AM',
    queue: 'missing',
    reviewLabel: 'Missing information',
    paymentLabel: 'Not charged',
    amountDue: 0,
    primaryAction: 'Resolve missing information',
    dogs: [
      {
        id: 'dog-river',
        name: 'River',
        armband: null,
        entries: [
          {
            id: 'entry-river-1',
            trial: 'Trial 1',
            trialDate: 'Sun, Jul 19',
            className: 'Container Excellent',
            handler: 'Marcus Chen',
            status: 'Missing information',
          },
        ],
      },
    ],
  },
  {
    id: 'registration-1032',
    exhibitor: 'Jamie Rivera',
    email: 'jamie@example.com',
    confirmation: 'SW-1032',
    submitted: 'Jul 13 · 1:04 PM',
    queue: 'payment',
    reviewLabel: 'Accepted',
    paymentLabel: '$145.00 due',
    amountDue: 145,
    primaryAction: 'Resolve payment',
    dogs: [
      {
        id: 'dog-luna',
        name: 'Luna',
        armband: '231',
        entries: [
          {
            id: 'entry-luna-1',
            trial: 'Trial 1',
            trialDate: 'Sun, Jul 19',
            className: 'Interior Master',
            handler: 'Jamie Rivera',
            status: 'Accepted',
          },
          {
            id: 'entry-luna-2',
            trial: 'Trial 2',
            trialDate: 'Sun, Jul 19',
            className: 'Exterior Master',
            handler: 'Jamie Rivera',
            status: 'Accepted',
          },
        ],
      },
    ],
  },
  {
    id: 'registration-1028',
    exhibitor: 'Priya Shah',
    email: 'priya@example.com',
    confirmation: 'SW-1028',
    submitted: 'Jul 13 · 3:29 PM',
    queue: 'review',
    reviewLabel: 'Needs review',
    paymentLabel: 'Check at show',
    amountDue: 80,
    primaryAction: 'Review registration',
    dogs: [
      {
        id: 'dog-bean',
        name: 'Bean',
        armband: '244',
        entries: [
          {
            id: 'entry-bean-1',
            trial: 'Trial 1',
            trialDate: 'Sun, Jul 19',
            className: 'Buried Novice B',
            handler: 'Priya Shah',
            status: 'Needs review',
          },
        ],
      },
    ],
  },
];

export function registrationEntryCount(registration: PrototypeRegistration): number {
  return registration.dogs.reduce((total, dog) => total + dog.entries.length, 0);
}

export function registrationClassCount(registration: PrototypeRegistration): number {
  return new Set(
    registration.dogs.flatMap(dog => dog.entries.map(entry => `${entry.trial}:${entry.className}`))
  ).size;
}

export function filterPrototypeRegistrations(
  registrations: PrototypeRegistration[],
  queue: PrototypeQueue,
  search: string
): PrototypeRegistration[] {
  const query = search.trim().toLowerCase();
  return registrations.filter(registration => {
    const matchesQueue = queue === 'all' || registration.queue === queue;
    if (!matchesQueue && !query) return false;
    if (!query) return true;
    const searchable = [
      registration.exhibitor,
      registration.email,
      registration.confirmation,
      ...registration.dogs.flatMap(dog => [
        dog.name,
        dog.armband ?? '',
        ...dog.entries.flatMap(entry => [entry.handler, entry.className, entry.trial]),
      ]),
    ]
      .join(' ')
      .toLowerCase();
    return searchable.includes(query);
  });
}
