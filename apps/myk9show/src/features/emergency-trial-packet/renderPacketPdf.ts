import { jsPDF } from 'jspdf';
import { buildEmergencyTrialPacketPdf } from './buildEmergencyTrialPacketPdf';
import type { EmergencyPacketModel } from './types';

/**
 * The app's binding of the runtime-agnostic renderer.
 *
 * `buildEmergencyTrialPacketPdf` takes the jsPDF constructor rather than
 * importing it, so the same file serves the browser and a Deno edge function
 * (MYK9-228 phase 2). This is the browser half; the edge function passes the
 * constructor from `npm:jspdf`, where the NAMED export is required — a default
 * import there fails with "jsPDF is not a constructor".
 */
export function renderEmergencyTrialPacketPdf(model: EmergencyPacketModel): Uint8Array {
  return buildEmergencyTrialPacketPdf(model, jsPDF);
}
