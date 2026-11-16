import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { jsPDF } from 'npm:jspdf@4.2.1';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

import { handle } from '../_shared/http/handler.ts';
import { requireFunctionSecret } from '../_shared/functionSecret.ts';
import { buildTrialDayPacketPdf } from '../_shared/trialPacket/renderer/judgePacketDay.ts';
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
 * The packet is the before-trial packet, judge by judge (MYK9-2079): the renderer takes pdf-lib
 * as well as jsPDF as arguments, for the same reason.
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
      renderPdf: input =>
        buildTrialDayPacketPdf({
          input,
          pdfLib: { PDFDocument, StandardFonts, rgb },
          JsPdf: jsPDF,
          printedAt: new Date(),
        }),
    })
);
