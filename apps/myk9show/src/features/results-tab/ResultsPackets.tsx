import { useMemo, useState } from 'react';

import { buildJudgeRecords } from '@/features/show-map/cockpit/trialPacket/judgeRecord';
import { buildJudgeReviews } from '@/features/show-map/cockpit/trialPacket/judgeReview';
import { TrialPacketPanel } from '@/features/show-map/cockpit/trialPacket/TrialPacketPanel';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import type { SecretaryEntry } from '@/services/database/entries';
import type { SyncableTrial } from '@/store/trial-store-types';

import type { ResultsClassRow } from './buildResultsClassRows';
import { ResultsFinishRow } from './ResultsFinishRow';
import { ResultsJudgeProgress } from './ResultsJudgeProgress';

type OpenPacket =
  | { kind: 'judge-review'; judgeKey: string | null }
  | { kind: 'judge-record'; judgeKey: string; day: string }
  | { kind: 'after-show'; trialId: string };

const NO_CORRECTIONS = new Map<string, never[]>();

/**
 * The end-of-show paperwork on Results (MYK9-1924 phases 2a and 2b): per-judge progress with the
 * judge review packet and, once a judge's day is initialled, the judge's record, and the finish row
 * with the after-show packet. Both open the Show Desk's one
 * packet panel; nothing here builds a second print surface.
 */
export function ResultsPackets({
  showId,
  trials,
  rows,
  entries,
  timeZone,
  allDone,
}: {
  showId: string;
  trials: readonly SyncableTrial[];
  rows: readonly ResultsClassRow[];
  entries: readonly SecretaryEntry[];
  timeZone: string;
  allDone: boolean;
}) {
  const { show } = useFastShowDetails(showId);
  const [packet, setPacket] = useState<OpenPacket | null>(null);
  // Corrections are read only when the panel opens, so the progress list builds without them.
  const judges = useMemo(
    () => buildJudgeReviews({ rows, entryInfo: entries, correctionsByEntryId: NO_CORRECTIONS }),
    [rows, entries]
  );
  const records = useMemo(
    () => buildJudgeRecords({ rows, entryInfo: entries, correctionsByEntryId: NO_CORRECTIONS }),
    [rows, entries]
  );
  return (
    <>
      <ResultsJudgeProgress
        judges={judges}
        onPrint={judgeKey => setPacket({ kind: 'judge-review', judgeKey })}
        records={records}
        onRecord={record =>
          setPacket({ kind: 'judge-record', judgeKey: record.judgeKey, day: record.day })
        }
      />
      <ResultsFinishRow
        showId={showId}
        trials={trials}
        allDone={allDone}
        onOpenAfterShow={trialId => setPacket({ kind: 'after-show', trialId })}
      />
      {packet?.kind === 'judge-review' && (
        <TrialPacketPanel
          open
          mode="judge-review"
          showId={showId}
          onClose={() => setPacket(null)}
          review={{
            rows,
            entries,
            showName: show?.name ?? '',
            timeZone,
            judgeKey: packet.judgeKey,
          }}
        />
      )}
      {packet?.kind === 'judge-record' && (
        <TrialPacketPanel
          open
          mode="judge-record"
          showId={showId}
          onClose={() => setPacket(null)}
          record={{
            rows,
            entries,
            showName: show?.name ?? '',
            timeZone,
            judgeKey: packet.judgeKey,
            day: packet.day,
          }}
        />
      )}
      {packet?.kind === 'after-show' && (
        <TrialPacketPanel
          open
          mode="after-show"
          showId={showId}
          trialId={packet.trialId}
          onClose={() => setPacket(null)}
        />
      )}
    </>
  );
}
