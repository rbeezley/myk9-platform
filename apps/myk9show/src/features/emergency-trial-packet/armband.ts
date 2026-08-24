/**
 * The packet renderer lives under `supabase/functions/_shared/trialPacket/`
 * so the browser and the `generate-trial-packet` edge function import the SAME
 * file (MYK9-228 phase 3). This re-export keeps the app's `@/features/...`
 * imports working without a second copy of the armband contract.
 */
export * from '../../../../../supabase/functions/_shared/trialPacket/renderer/armband.ts';
