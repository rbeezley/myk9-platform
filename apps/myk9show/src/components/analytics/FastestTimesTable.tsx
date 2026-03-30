import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import type { FastestTimeEntry } from './analytics-utils';
import { formatTime } from './analytics-formatting';

interface FastestTimesTableProps {
  times: FastestTimeEntry[];
  showShowColumn?: boolean;
}

const RANK_MEDALS: Record<number, string> = {
  1: '\uD83E\uDD47',
  2: '\uD83E\uDD48',
  3: '\uD83E\uDD49',
};

export function FastestTimesTable({ times, showShowColumn }: FastestTimesTableProps) {
  if (times.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fastest Times</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 pr-2">Rank</th>
              <th className="pb-2 pr-2">Dog</th>
              <th className="pb-2 pr-2">Class</th>
              {showShowColumn && <th className="pb-2 pr-2">Show</th>}
              <th className="pb-2 text-right">Time</th>
            </tr>
          </thead>
          <tbody>
            {times.map((t) => (
              <tr key={t.id} className="border-b border-border/30 last:border-0">
                <td className="py-2 pr-2">{RANK_MEDALS[t.rank] ?? t.rank}</td>
                <td className="py-2 pr-2">{t.dogCallName}</td>
                <td className="py-2 pr-2">
                  {[t.classElement, t.classLevel].filter(Boolean).join(' ')}
                </td>
                {showShowColumn && <td className="py-2 pr-2">{t.showName}</td>}
                <td className="py-2 text-right font-mono">{formatTime(t.searchTimeSeconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
