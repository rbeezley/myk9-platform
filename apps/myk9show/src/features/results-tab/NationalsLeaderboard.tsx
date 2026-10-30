import { ArrowLeft, Trophy } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { SecretaryEntry } from '@/services/database/entries';
import type { ResultsClassRow } from './buildResultsClassRows';
import {
  buildNationalsLeaderboard,
  formatLeaderboardTime,
  NATIONALS_DAYS,
} from './nationalsLeaderboard';
import { getNationalsLeaderboardHref, getResultsListHref } from './resultsTabRoutes';

const DASH = '–';

/** The way into the leaderboard from the class list; rendered only for a nationals show. */
export function NationalsLeaderboardLink({
  showId,
  isNationals,
}: {
  showId: string;
  isNationals: boolean | null;
}) {
  if (isNationals !== true) return null;
  return (
    <Button asChild variant="outline" className="min-h-11 gap-2">
      <Link to={getNationalsLeaderboardHref(showId)}>
        <Trophy className="h-4 w-4" aria-hidden="true" />
        Nationals leaderboard
      </Link>
    </Button>
  );
}

interface NationalsLeaderboardViewProps {
  showId: string;
  entries: readonly SecretaryEntry[];
  rows: readonly ResultsClassRow[];
  showStartDate: string | null | undefined;
}

/**
 * MYK9-1516: the ranked table of released nationals scores. A view of the Results tab, so it reads
 * the same entries and the same release stamps; see `nationalsLeaderboard.ts` for the ranking.
 */
export function NationalsLeaderboardView({
  showId,
  entries,
  rows,
  showStartDate,
}: NationalsLeaderboardViewProps) {
  const board = useMemo(
    () => buildNationalsLeaderboard({ entries, classRows: rows, showStartDate }),
    [entries, rows, showStartDate]
  );
  return (
    <div className="mt-4 space-y-4">
      <Button asChild variant="ghost" className="min-h-11 gap-2">
        <Link to={getResultsListHref(showId)}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to classes
        </Link>
      </Button>
      <h1 className="text-xl font-semibold">Nationals Leaderboard</h1>
      {board.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No rankings yet.</p>
          <p>Rankings appear here once entries are scored.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Armband</TableHead>
                <TableHead>Dog</TableHead>
                <TableHead>Handler</TableHead>
                <TableHead className="text-right">Total Pts</TableHead>
                <TableHead className="text-right">Total Time</TableHead>
                {NATIONALS_DAYS.map(day => (
                  <TableHead key={day} className="text-right">
                    Day {day}
                  </TableHead>
                ))}
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {board.map(row => (
                <TableRow key={row.armband}>
                  <TableCell>{row.rank}</TableCell>
                  <TableCell>{row.armband}</TableCell>
                  <TableCell>{row.dogName}</TableCell>
                  <TableCell>{row.handlerName || DASH}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.totalPoints}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatLeaderboardTime(row.totalTimeSeconds)}
                  </TableCell>
                  {NATIONALS_DAYS.map(day => (
                    <TableCell key={day} className="text-right tabular-nums">
                      {row.dayPoints[day] ?? DASH}
                    </TableCell>
                  ))}
                  <TableCell>{row.status ?? DASH}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
