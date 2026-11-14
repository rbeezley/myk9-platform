import { useEffect, useState } from 'react';

import type { CollatedTrialPacket } from './collateTrialPacket';

export type TrialPacketPdfs =
  | { status: 'building' }
  | { status: 'error' }
  | { status: 'ready'; byJudgeKey: ReadonlyMap<string, Uint8Array>; all: Uint8Array };

/**
 * Builds one PDF per judge, and one holding every packet in print order. Loaded on demand: the
 * renderer and pdf-lib join the show desk only when the panel opens.
 */
export function useTrialPacketPdfs(
  packet: CollatedTrialPacket | null,
  showName: string,
  attempt: number
): TrialPacketPdfs {
  const [built, setBuilt] = useState<{
    packet: CollatedTrialPacket;
    attempt: number;
    result: TrialPacketPdfs;
  } | null>(null);

  useEffect(() => {
    if (!packet) return;
    let superseded = false;
    void (async () => {
      try {
        const [{ buildJudgePacketPdf }, { mergeReportPdfs }] = await Promise.all([
          import('./buildJudgePacketPdf'),
          import('../mergeReportPdfs'),
        ]);
        const byJudgeKey = new Map<string, Uint8Array>();
        for (const judge of packet.judges) {
          byJudgeKey.set(judge.key, await buildJudgePacketPdf(packet, judge, showName));
        }
        const all = await mergeReportPdfs([...byJudgeKey.values()]);
        if (!superseded) {
          setBuilt({ packet, attempt, result: { status: 'ready', byJudgeKey, all } });
        }
      } catch {
        if (!superseded) setBuilt({ packet, attempt, result: { status: 'error' } });
      }
    })();
    return () => {
      superseded = true;
    };
  }, [packet, showName, attempt]);

  return built && built.packet === packet && built.attempt === attempt
    ? built.result
    : { status: 'building' };
}
