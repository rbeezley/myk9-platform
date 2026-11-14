import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildJudgePacketPdf } from './buildJudgePacketPdf';
import { collateTrialPacket } from './collateTrialPacket';
import { CLASSES, ENTRIES, SHOW, TRIAL } from './trialPacketFixtures';

// Writes one sample judge packet for a person to open and look at (the footer against the page
// content). Skipped unless WRITE_PACKET_SAMPLE=1; PACKET_SAMPLE_OUT overrides the output path.
describe.skipIf(process.env.WRITE_PACKET_SAMPLE !== '1')('sample judge packet', () => {
  it('writes the first judge’s packet PDF', async () => {
    const packet = collateTrialPacket({
      show: SHOW,
      trials: [TRIAL],
      classes: CLASSES,
      entries: ENTRIES,
      trialId: TRIAL.id,
    });
    const judge = packet?.judges[0];
    if (!packet || !judge) throw new Error('no packet');
    const out = resolve(process.env.PACKET_SAMPLE_OUT ?? '../../.logs/packet-sample.pdf');
    mkdirSync(dirname(out), { recursive: true });
    const bytes = await buildJudgePacketPdf(packet, judge, SHOW.name);
    writeFileSync(out, bytes);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});
