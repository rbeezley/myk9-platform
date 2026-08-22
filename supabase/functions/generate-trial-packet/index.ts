import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { jsPDF } from 'npm:jspdf@4.2.1';

import { handle } from '../_shared/http/handler.ts';
import { requireFunctionSecret } from '../_shared/functionSecret.ts';
import { buildEmergencyTrialPacketPdf } from '../_shared/trialPacket/renderer/buildEmergencyTrialPacketPdf.ts';
import {
  generateTrialPackets,
  validateGenerateRequest,
  type GeneratePacketRequest,
} from './packetGeneration.ts';

/**
 * generate-trial-packet — the packet exists whether or not anyone remembered.
 *
 * Server-to-server only: no CORS origins are advertised and there is no JWT
 * path, because no browser should reach this. The show manager's button still
 * goes through `deliver-trial-packet` with their own credentials.
 *
 * The NAMED jspdf export is required here. `import jsPDF from 'npm:jspdf'`
 * type-checks and then fails at runtime with "jsPDF is not a constructor" —
 * which is why the renderer takes the constructor as an argument rather than
 * importing it, so the browser and this function each supply their own.
 */

handle<GeneratePacketRequest>(
  {
    auth: 'none',
    beforeBody: req => requireFunctionSecret(req, 'PACKET_CRON_SECRET'),
  },
  async ({ body, supabase }) =>
    await generateTrialPackets(supabase, validateGenerateRequest(body), {
      renderPdf: model => buildEmergencyTrialPacketPdf(model, jsPDF),
    })
);
