import type { NotificationPayload, NotificationPriority } from './types';

interface YourTurnInput {
  dogName: string;
  className: string;
  dogsAhead: number;
  armband: string | null;
  ringNumber?: number;
  conflicts?: Array<{ className: string; dogsAhead: number }>;
}

interface ClassStartingInput {
  className: string;
  ringNumber?: number;
}

interface ResultsPostedInput {
  dogName: string;
  className: string;
}

interface CheckInReminderInput {
  dogName: string;
  className: string;
}

interface AnnouncementInput {
  title: string;
  body: string;
  priority?: NotificationPriority;
}

function makePayload(partial: Omit<NotificationPayload, 'id' | 'timestamp'>): NotificationPayload {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    ...partial,
  };
}

export function buildYourTurnPayload(input: YourTurnInput): NotificationPayload {
  const isNext = input.dogsAhead <= 0;
  const title = isNext
    ? `${input.dogName} — You're up!`
    : `${input.dogName} — ${input.dogsAhead} dogs away`;

  const ringSuffix = input.ringNumber ? ` (Ring ${input.ringNumber})` : '';
  const body = isNext
    ? `Your turn in ${input.className}${ringSuffix}`
    : `${input.dogsAhead} dogs ahead in ${input.className}${ringSuffix}`;

  return makePayload({
    type: 'your_turn',
    title,
    body,
    priority: 'urgent',
    data: {
      dogName: input.dogName,
      className: input.className,
      dogsAhead: input.dogsAhead,
      armband: input.armband,
      ringNumber: input.ringNumber ?? null,
      ...(input.conflicts?.length ? { conflicts: input.conflicts } : {}),
    },
  });
}

export function buildClassStartingPayload(input: ClassStartingInput): NotificationPayload {
  const ringSuffix = input.ringNumber ? ` — Ring ${input.ringNumber}` : '';
  return makePayload({
    type: 'class_starting',
    title: `${input.className} starting${ringSuffix}`,
    body: `${input.className} is now in progress`,
    priority: 'high',
    data: { className: input.className, ringNumber: input.ringNumber ?? null },
  });
}

export function buildResultsPostedPayload(input: ResultsPostedInput): NotificationPayload {
  return makePayload({
    type: 'results_posted',
    title: 'Results posted',
    body: `${input.dogName} — ${input.className}`,
    priority: 'normal',
    data: { dogName: input.dogName, className: input.className },
  });
}

export function buildCheckInReminderPayload(input: CheckInReminderInput): NotificationPayload {
  return makePayload({
    type: 'check_in_reminder',
    title: 'Check in now',
    body: `${input.dogName} — ${input.className} check-in is open`,
    priority: 'high',
    data: { dogName: input.dogName, className: input.className },
  });
}

export function buildAnnouncementPayload(input: AnnouncementInput): NotificationPayload {
  return makePayload({
    type: 'announcement',
    title: input.title,
    body: input.body,
    priority: input.priority ?? 'normal',
  });
}
