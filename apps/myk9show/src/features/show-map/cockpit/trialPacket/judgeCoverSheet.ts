import { jsPDF } from 'jspdf';

import {
  drawJudgeCoverPdf,
  type JudgeCoverModel,
} from '../../../../../../../supabase/functions/_shared/trialPacket/renderer/judgeCoverSheet.ts';

// The cover's model and drawing live in the shared renderer (MYK9-2085), so the edge function
// builds the same sheet. Only the jsPDF binding is the app's.
export * from '../../../../../../../supabase/functions/_shared/trialPacket/renderer/judgeCoverSheet.ts';

/** The cover sheet as a one-page PDF (a judge's packet starts with it). */
export function renderJudgeCoverPdf(model: JudgeCoverModel): Uint8Array {
  return drawJudgeCoverPdf(model, jsPDF);
}
