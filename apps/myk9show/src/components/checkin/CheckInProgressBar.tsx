interface CheckInProgressBarProps {
  checkedInCount: number;
  partialCount: number;
  noneCount: number;
  totalEntries: number;
}

export function CheckInProgressBar({
  checkedInCount,
  partialCount,
  noneCount,
  totalEntries,
}: CheckInProgressBarProps) {
  const actionableCount = checkedInCount + partialCount;
  const percentage = totalEntries > 0 ? Math.round((actionableCount / totalEntries) * 100) : 0;

  const checkedInPct = totalEntries > 0 ? (checkedInCount / totalEntries) * 100 : 0;
  const partialPct = totalEntries > 0 ? (partialCount / totalEntries) * 100 : 0;
  const nonePct = totalEntries > 0 ? (noneCount / totalEntries) * 100 : 0;

  return (
    <div className="rounded-xl bg-card p-4 shadow-card">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-semibold">Check-In Progress</span>
        <span className="text-muted-foreground">
          {actionableCount} / {totalEntries} &middot; {percentage}%
        </span>
      </div>

      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          data-testid="progress-segment"
          className="transition-all duration-500"
          style={{ width: `${checkedInPct}%`, backgroundColor: 'var(--checkin-checked-in)' }}
        />
        <div
          data-testid="progress-segment"
          className="transition-all duration-500"
          style={{ width: `${partialPct}%`, backgroundColor: 'var(--checkin-conflict)' }}
        />
        <div
          data-testid="progress-segment"
          className="transition-all duration-500"
          style={{ width: `${nonePct}%`, backgroundColor: 'var(--checkin-none)' }}
        />
      </div>

      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span>
          <span style={{ color: 'var(--checkin-checked-in)' }}>&bull;</span> Checked In{' '}
          {checkedInCount}
        </span>
        <span>
          <span style={{ color: 'var(--checkin-conflict)' }}>&bull;</span> Partial {partialCount}
        </span>
        <span>
          <span style={{ color: 'var(--checkin-none)' }}>&bull;</span> Not Checked In {noneCount}
        </span>
      </div>
    </div>
  );
}
