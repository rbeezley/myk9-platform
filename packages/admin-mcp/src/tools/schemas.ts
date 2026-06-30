/**
 * Tool input schemas and shared validation helpers (zod).
 *
 * The MCP boundary advertises JSON Schema (derived from these) and validates
 * every incoming call against them, so a tool handler never sees malformed
 * input. Limits are clamped to the configured max so no caller can request an
 * unbounded result set.
 */
import { z } from 'zod';

import type { AdminMcpConfig } from '../config';

// Accept any UUID-shaped string (DB ids are v4, but stay permissive on version).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const uuidSchema = z.string().trim().regex(UUID_RE, 'must be a UUID');

export const searchStringSchema = z
  .string()
  .trim()
  .min(1, 'must not be empty');

/**
 * Build a limit schema bound to this server's config: defaults to
 * `defaultLimit` when omitted and clamps any larger request down to `maxLimit`.
 * Non-positive or non-integer values are rejected (fail closed).
 */
export function makeLimitSchema(config: AdminMcpConfig) {
  return z.coerce
    .number()
    .int('must be an integer')
    .positive('must be positive')
    .default(config.defaultLimit)
    .transform((value) => Math.min(value, config.maxLimit));
}

// ---------------------------------------------------------------------------
// V1.0 diagnostic tool inputs (Tasks 6-8).
// ---------------------------------------------------------------------------

export const diagnoseConfirmationEmailInput = z.object({
  entryId: uuidSchema,
});

export const listShowAccessInput = z.object({
  showId: uuidSchema,
});

export const diagnosePaymentInput = z
  .object({
    entryId: uuidSchema.optional(),
    paymentIntentId: searchStringSchema.optional(),
    checkoutSessionId: searchStringSchema.optional(),
  })
  // Exactly one identifier — fail closed on ambiguity rather than silently
  // prioritizing one and hiding a mismatch the admin is trying to diagnose.
  .refine(
    (value) =>
      [value.entryId, value.paymentIntentId, value.checkoutSessionId].filter(
        Boolean,
      ).length === 1,
    {
      message:
        'provide exactly one of entryId, paymentIntentId, or checkoutSessionId',
    },
  );

export type DiagnoseConfirmationEmailInput = z.infer<
  typeof diagnoseConfirmationEmailInput
>;
export type ListShowAccessInput = z.infer<typeof listShowAccessInput>;
export type DiagnosePaymentInput = z.infer<typeof diagnosePaymentInput>;
