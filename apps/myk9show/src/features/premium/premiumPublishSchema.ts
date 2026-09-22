import { z } from 'zod';
import type { GeneratedPremium } from '@/types/premium-types';
import type { PremiumPublishAttempt } from './premiumPublishIntent';

const nullableText = z.string().nullable();
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
    venue: z.string(),
    entryOpenDate: nullableText,
    entryCloseDate: nullableText,
    preEntryFee: z.number(),
    dayOfFee: z.number(),
    acceptChecks: z.boolean(),
    acceptCash: z.boolean(),
  }),
  club: z.object({ name: z.string(), logoUrl: nullableText }),
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
      classes: z.array(
        z.object({ element: z.string(), level: z.string(), section: nullableText })
      ),
    })
  ),
  supplemental: z.object({
    vetClinic: z.object({ name: z.string(), address: z.string(), phone: z.string() }).nullable(),
    accommodations: z.array(
      z.object({ name: z.string(), address: z.string(), phone: z.string() })
    ),
    coverImageUrl: nullableText,
    hospitalityNotes: nullableText,
    awardsDescription: nullableText,
    additionalNotes: nullableText,
  }),
  narrativeGenerationError: nullableText.optional(),
  narratives: z.object({ showHours: z.string(), trialInformation: z.string() }),
});

const persistedAttemptSchema = z.object({
  schemaVersion: z.literal(2),
  showId: z.string().min(1),
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
