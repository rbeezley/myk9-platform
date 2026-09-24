import { z } from 'zod';
import type { GeneratedPremium } from '@/types/premium-types';
import type { PremiumPublishAttempt } from './premiumPublishIntent';

const nullableText = z.string().nullable();
const nullableAmount = z.number().nullable();
// Accommodations are free-form template jsonb; a missing field renders blank.
const looseText = z
  .string()
  .nullish()
  .transform(value => value ?? '');
const premiumStyle = z.enum([
  'monogram',
  'banner',
  'headline',
  'magazine',
  'poster',
  'gazette',
  'fieldGuide',
  'heritage',
]);

const generatedPremiumSchema = z.object({
  org: z.enum(['AKC', 'UKC']),
  style: premiumStyle,
  templateId: nullableText,
  show: z.object({
    name: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    // Nullable at the source (shows.location, the two fee columns, and
    // clubs.name via a nullable club_id); the PDF templates render them as
    // '—' / 'Host Club'. Requiring them failed publish for sparse drafts.
    venue: nullableText,
    entryOpenDate: nullableText,
    entryCloseDate: nullableText,
    preEntryFee: nullableAmount,
    dayOfFee: nullableAmount,
    acceptChecks: z.boolean(),
    acceptCash: z.boolean(),
  }),
  club: z.object({ name: nullableText, logoUrl: nullableText }),
  secretary: z.object({
    name: nullableText,
    email: nullableText,
    phone: nullableText,
    mailingAddress: nullableText,
  }),
  officials: z.object({
    chairman: z.object({ name: z.string(), email: nullableText, phone: nullableText }).nullable(),
  }),
  trials: z.array(
    z.object({
      name: z.string(),
      date: z.string(),
      startTime: nullableText,
      eventNumber: nullableText,
      type: z.string(),
      judges: z.array(z.object({ name: z.string(), elements: z.array(z.string()) })),
      classes: z.array(z.object({ element: z.string(), level: z.string(), section: nullableText })),
    })
  ),
  supplemental: z.object({
    vetClinic: z.object({ name: z.string(), address: z.string(), phone: z.string() }).nullable(),
    accommodations: z.array(z.object({ name: looseText, address: looseText, phone: looseText })),
    coverImageUrl: nullableText,
    hospitalityNotes: nullableText,
    awardsDescription: nullableText,
    additionalNotes: nullableText,
  }),
  narrativeGenerationError: nullableText.optional(),
  narratives: z.object({ showHours: z.string(), trialInformation: z.string() }),
});

const persistedAttemptSchema = z.object({
  schemaVersion: z.literal(4),
  mode: z.enum(['generated', 'draft']),
  intentKey: z.string().min(1),
  showId: z.string().min(1),
  publisherId: z.string().min(1),
  fingerprint: z.string().min(1),
  intent: z.object({ premium: generatedPremiumSchema, inkSaver: z.boolean() }),
  artifactId: z.string().min(1),
  publishVersion: z.number().int().positive().safe(),
});

export function parseGeneratedPremium(value: unknown): GeneratedPremium {
  return generatedPremiumSchema.parse(value) as GeneratedPremium;
}

export function parsePersistedPremiumAttempt(value: unknown): PremiumPublishAttempt | null {
  const parsed = persistedAttemptSchema.safeParse(value);
  return parsed.success ? (parsed.data as PremiumPublishAttempt) : null;
}
