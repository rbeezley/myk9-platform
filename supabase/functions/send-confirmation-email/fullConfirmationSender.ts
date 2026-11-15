// Sends the due full confirmations (MYK9-1999), one email per exhibitor per show. Deno-free and
// written against FullConfirmationStore so a test can run it on an in-memory store.
//
// Once only: the due entries are CLAIMED (confirmation_email_sent_at set where it is still null)
// before the send, so two overlapping runs cannot both send them. A failed send releases the
// claim for the next run; Resend's Idempotency-Key (show, person and the exact entries) makes a
// retry of a send that did go out the same message, not a second one.

import { formatStreetAddress, judgeFor, myShowsUrl } from '../_shared/exhibitorEmailFacts.ts';
import type {
  ConfirmationEmailBaseData,
  ConfirmationEmailRunRow,
} from './confirmation-email-shared.ts';
import { formatDateRange, formatTrialDay } from './heritage-email.ts';
import { buildTrialLabelMap } from './trialLabel.ts';
import { buildVenueMapAssets } from './venue-directions.ts';
import { formatEntryFee } from './entryFee.ts';
import { getPublishedExperienceHospitalityNotes } from './published-experience.ts';
import { renderConfirmationHtml } from './renderConfirmation.ts';
import {
  SENDABLE_SHOW_STATUSES,
  entriesListedFor,
  fullConfirmationIdempotencyKey,
  groupDueConfirmations,
  joinDogNames,
  registryWording,
  type ConfirmationEntryRow,
  type ConfirmationGroup,
} from './fullConfirmation.ts';

export interface ConfirmationShowRow {
  id: string;
  name: string;
  status: string | null;
  deleted_at: string | null;
  start_date: string;
  end_date: string;
  venue_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  latitude: number | null;
  longitude: number | null;
  organization: string | null;
  style: string | null;
  brand_color?: unknown;
  confirmation_message: string | null;
  experience_is_published?: boolean | null;
  experience_published_style: string | null;
  experience_published_content?: unknown;
}

export interface ConfirmationTrialRow {
  id: string;
  name: string | null;
  trial_number: string | null;
  date: string;
  registry_id: string | null;
}

/** Everything one show's emails are written from, read once per show per run. */
export interface ConfirmationShowFacts {
  show: ConfirmationShowRow;
  /** In display order. */
  trials: ConfirmationTrialRow[];
  /** Every accepted entry in the show, for the listing. */
  entries: ConfirmationEntryRow[];
  judgesByClass: Map<string, string>;
  /** enrollments.confirmation_number by registration id. */
  confirmationNumbers: Map<string, string>;
}

export interface ConfirmationPerson {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

export interface EmailLogInput {
  recipientEmail: string | null;
  anchorEntryId: string;
  showId: string;
  status: 'sent' | 'failed';
  resendMessageId?: string | null;
  errorMessage?: string | null;
  subject: string | null;
  bodyHtml: string | null;
}

export interface FullConfirmationStore {
  /** Accepted entries not yet confirmed, oldest first, at most `limit`. */
  listDueEntries(limit: number): Promise<ConfirmationEntryRow[]>;
  loadShowFacts(showId: string): Promise<ConfirmationShowFacts | null>;
  loadPerson(personId: string): Promise<ConfirmationPerson | null>;
  /** Sets confirmation_email_sent_at where still null; returns the ids this call claimed. */
  claim(entryIds: string[], nowIso: string): Promise<string[]>;
  markSent(entryIds: string[], messageId: string | null): Promise<void>;
  /** Gives a claim back after a failed send: retried on the next run. */
  release(entryIds: string[]): Promise<void>;
  /** No address to send to: given up on, recorded once. */
  markUndeliverable(entryIds: string[]): Promise<void>;
  logEmail(row: EmailLogInput): Promise<void>;
}

export type SendResult = { ok: true; messageId: string | null } | { ok: false; error: string };

export interface FullConfirmationDeps {
  store: FullConfirmationStore;
  send(
    email: { to: string; subject: string; html: string },
    idempotencyKey: string
  ): Promise<SendResult>;
  siteUrl?: string | null;
  now?: () => Date;
}

export interface FullConfirmationResult {
  sent: number;
  failed: number;
  skipped: number;
}

const DUE_ENTRY_READ_LIMIT = 500;

function isSendableShow(show: ConfirmationShowRow, today: string): boolean {
  return (
    !show.deleted_at &&
    (SENDABLE_SHOW_STATUSES as readonly string[]).includes(show.status ?? '') &&
    (show.end_date ?? show.start_date) >= today
  );
}

function classLabel(entry: ConfirmationEntryRow): string {
  return (
    [entry.class?.level, entry.class?.element ?? entry.class?.name].filter(Boolean).join(' · ') ||
    entry.class?.name ||
    'Class'
  );
}

/** The subject and body of one exhibitor's full confirmation. */
export function buildFullConfirmation(
  facts: ConfirmationShowFacts,
  person: ConfirmationPerson,
  listed: ConfirmationEntryRow[],
  siteUrl: string | null | undefined
): { subject: string; html: string } {
  const { show, trials } = facts;
  const trialById = new Map(trials.map(trial => [trial.id, trial]));
  const trialLabels = buildTrialLabelMap(trials);
  const dogNames = [...new Set(listed.map(entry => entry.dog?.name ?? 'Your dog'))];
  const oneDog = dogNames.length === 1;
  const first = listed[0];

  const runs: ConfirmationEmailRunRow[] = listed.map(entry => {
    const trial = entry.trial_id ? trialById.get(entry.trial_id) : undefined;
    return {
      numeral: (entry.trial_id && trialLabels.get(entry.trial_id)) || 'Trial',
      dayLabel: trial?.date ? formatTrialDay(trial.date) : '',
      // Several dogs in one email: each run says whose it is.
      classLabel: oneDog ? classLabel(entry) : `${entry.dog?.name ?? 'Dog'}: ${classLabel(entry)}`,
      judgeName: judgeFor(facts.judgesByClass, entry.class_id),
      armband: entry.armband ?? null,
    };
  });

  const street = formatStreetAddress(show);
  // The venue on its first line (the directions link names it), the street below.
  const streetLine =
    formatStreetAddress({ ...show, venue_name: null }) ??
    ([show.city, show.state].filter(Boolean).join(', ') || null);
  const venue = [show.venue_name, streetLine].filter(Boolean).join('\n') || null;
  const registrations = [...new Set(listed.map(entry => entry.registration_id).filter(Boolean))];
  const wording = registryWording(trials[0]?.registry_id);
  const totalDollars = listed.reduce((sum, entry) => sum + Number(entry.entry_fee ?? 0), 0);

  const emailData: ConfirmationEmailBaseData = {
    venueMap: buildVenueMapAssets(show.latitude, show.longitude, street ?? venue),
    clubName: show.organization ?? show.name,
    clubEstablished: null,
    clubCity: [show.city, show.state].filter(Boolean).join(', ') || null,
    showTitle: show.name,
    dateRange: formatDateRange(show.start_date, show.end_date ?? show.start_date),
    salutation: [person.first_name, person.last_name].filter(Boolean).join(' ') || 'Exhibitor',
    dogName: oneDog ? (dogNames[0] ?? 'Your dog') : joinDogNames(dogNames),
    dogCallName: oneDog ? (first?.dog?.call_name ?? null) : null,
    dogBreed: oneDog ? (first?.dog?.breed ?? null) : null,
    dogSex: oneDog ? (first?.dog?.sex ?? null) : null,
    runs,
    runCount: runs.length,
    totalFeesFormatted: formatEntryFee(totalDollars),
    receiptNumber:
      registrations.length === 1
        ? (facts.confirmationNumbers.get(registrations[0] as string) ?? null)
        : null,
    venue,
    doorsTime: null,
    firstClassTime: null,
    parkingNotes: null,
    hospitalityNotes: getPublishedExperienceHospitalityNotes(
      show as Parameters<typeof getPublishedExperienceHospitalityNotes>[0]
    ),
    cratingNotes: null,
    secretaryEmail: null,
    secretaryPhone: null,
    trialUrl: null,
    trialChairName: null,
    trialChairTitle: null,
    memberClubLanguage: wording.memberClubLanguage,
    noteToExhibitors: show.confirmation_message,
    myShowsUrl: myShowsUrl(siteUrl),
  };

  const html = renderConfirmationHtml(emailData, {
    style: show.style,
    experiencePublishedStyle: show.experience_published_style,
    brandColor: show.brand_color,
    startDate: show.start_date,
    licenseLanguage: wording.licenseLanguage,
  });
  return { subject: `Your entry to ${show.name} is confirmed`, html };
}

async function sendGroup(
  deps: FullConfirmationDeps,
  group: ConfirmationGroup,
  facts: ConfirmationShowFacts
): Promise<'sent' | 'failed' | 'skipped'> {
  const { store } = deps;
  const person = await store.loadPerson(group.personId);
  const anchorEntryId = [...group.dueEntryIds].sort()[0] as string;

  if (!person?.email) {
    await store.markUndeliverable(group.dueEntryIds);
    await store.logEmail({
      recipientEmail: null,
      anchorEntryId,
      showId: group.showId,
      status: 'failed',
      errorMessage: 'missing_recipient',
      subject: null,
      bodyHtml: null,
    });
    return 'failed';
  }

  const claimed = await store.claim(group.dueEntryIds, (deps.now?.() ?? new Date()).toISOString());
  if (claimed.length === 0) return 'skipped';
  const claimedGroup = { ...group, dueEntryIds: claimed };

  const listed = entriesListedFor(
    facts.entries,
    group.personId,
    new Map(facts.trials.map((trial, index) => [trial.id, index]))
  );
  const { subject, html } = buildFullConfirmation(facts, person, listed, deps.siteUrl);

  let result: SendResult;
  try {
    result = await deps.send(
      { to: person.email, subject, html },
      await fullConfirmationIdempotencyKey(claimedGroup)
    );
  } catch {
    result = { ok: false, error: 'email_delivery_error' };
  }

  if (!result.ok) {
    await store.release(claimed);
    await store.logEmail({
      recipientEmail: person.email,
      anchorEntryId,
      showId: group.showId,
      status: 'failed',
      errorMessage: result.error,
      subject,
      bodyHtml: html,
    });
    return 'failed';
  }
  await store.markSent(claimed, result.messageId);
  await store.logEmail({
    recipientEmail: person.email,
    anchorEntryId,
    showId: group.showId,
    status: 'sent',
    resendMessageId: result.messageId,
    subject,
    bodyHtml: html,
  });
  return 'sent';
}

/** One scheduled run: every due exhibitor of every published show, up to the per-run cap. */
export async function sendDueFullConfirmations(
  deps: FullConfirmationDeps
): Promise<FullConfirmationResult> {
  const result: FullConfirmationResult = { sent: 0, failed: 0, skipped: 0 };
  const today = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);
  const due = await deps.store.listDueEntries(DUE_ENTRY_READ_LIMIT);
  const { groups } = groupDueConfirmations(due);
  const factsByShow = new Map<string, ConfirmationShowFacts | null>();

  for (const group of groups) {
    if (!factsByShow.has(group.showId)) {
      factsByShow.set(group.showId, await deps.store.loadShowFacts(group.showId));
    }
    const facts = factsByShow.get(group.showId);
    if (!facts || !isSendableShow(facts.show, today)) {
      result.skipped++;
      continue;
    }
    try {
      result[await sendGroup(deps, group, facts)]++;
    } catch (error) {
      // One exhibitor's failure never stops the others.
      console.error('Full confirmation failed', {
        message: error instanceof Error ? error.message : '',
      });
      result.failed++;
    }
  }
  return result;
}
