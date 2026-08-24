/**
 * The packet renderer now lives under `supabase/functions/_shared/trialPacket/`
 * so the browser and the `generate-trial-packet` edge function import the SAME
 * file — a Deno function cannot reach into `apps/myk9show/src`, and a copy on
 * either side would be a second renderer to keep in step (MYK9-228 phase 3).
 *
 * This re-export keeps every `@/features/emergency-trial-packet/...` import in
 * the app working, and keeps the alias-free constraint on the shared module in
 * one obvious place.
 */
export * from '../../../../../supabase/functions/_shared/trialPacket/renderer/scoresheetConfig.ts';
