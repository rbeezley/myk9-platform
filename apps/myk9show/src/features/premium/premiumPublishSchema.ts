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
  org: z.enum(['AKC', 'UKC', 'ASCA']),
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
    // MYK9-2230: the address parts; optional so older premiums parse, and listed so zod keeps them.
    venueName: nullableText.optional(),
    address: nullableText.optional(),
    city: nullableText.optional(),
    state: nullableText.optional(),
    zipCode: nullableText.optional(),
    entryOpenDate: nullableText,
    entryCloseDate: nullableText,
    preEntryFee: nullableAmount,
    dayOfFee: nullableAmount,
    acceptChecks: z.boolean(),
    acceptCash: z.boolean(),
    // MYK9-2220: optional so older premiums parse; without it zod would strip the limit.
    maxTotalEntries: nullableAmount.optional(),
    // MYK9-2231: optional and nullable, so an older premium parses and zod keeps them.
    allowWaitlist: z.boolean().nullable().optional(),
    allowClassChangesAfterClose: z.boolean().nullable().optional(),
    // MYK9-1976: optional, so a premium generated before it still parses (and prints no
    // policy row). Without it here zod would strip the policy from every new premium.
    withdrawal: z
      .object({
        withdrawal_cutoff_date: nullableText.optional(),
        withdrawal_retention_type: nullableText.optional(),
        withdrawal_retention_value: nullableAmount.optional(),
        withdrawal_policy_notes: nullableText.optional(),
        withdrawal_policy_text: nullableText.optional(),
        trials: z
          .array(z.object({ registry_id: nullableText.optional() }))
          .nullable()
          .optional(),
        clubs: z
          .object({
            default_withdrawal_retention_type: nullableText.optional(),
            default_withdrawal_retention_value: nullableAmount.optional(),
            default_withdrawal_policy_notes: nullableText.optional(),
            default_withdrawal_policy_text: nullableText.optional(),
          })
          .nullable()
          .optional(),
      })
      .nullable()
      .optional(),
  }),
  club: z.object({ name: nullableText, logoUrl: nullableText }),
  secretary: z.object({
    name: nullableText,
    email: nullableText,
    phone: nullableText,
    mailingAddress: nullableText,
  }),
  officials: z.object({
    chairman: z
      .object({
        name: z.string(),
        email: nullableText,
        phone: nullableText,
        // MYK9-2065: absent on a premium generated before the field existed.
        mailingAddress: nullableText.optional(),
      })
      .nullable(),
  }),
  officers: z.array(z.object({ position: z.string(), name: z.string() })).optional(),
  committee: z.array(z.string()).optional(),
  trials: z.array(
    z.object({
      name: z.string(),
      date: z.string(),
      startTime: nullableText,
      eventNumber: nullableText,
      type: z.string(),
      // MYK9-2229: optional so older premiums parse; without it zod would strip the trial limit.
      maxTotalEntries: nullableAmount.optional(),
      // MYK9-2067: rows published before residence and classes existed carry neither (they
      // carried `elements`, which is dropped on parse), so both default.
      judges: z.array(
        z.object({
          name: z.string(),
          residence: nullableText.default(null),
          classes: z.array(z.string()).default([]),
        })
      ),
      classes: z.array(
        z.object({
          element: z.string(),
          level: z.string(),
          section: nullableText,
          // MYK9-2231: optional and nullable; zod would strip them otherwise.
          name: nullableText.optional(),
          entryFee: nullableAmount.optional(),
          allowWaitlist: z.boolean().nullable().optional(),
        })
      ),
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
