import { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, X } from 'lucide-react';
import type { Entry } from '../../../stores/entryStore';
import type { ClassInfo } from '../types';

const PENDING_PREFIX = 'myk9:class-completion-pending:';
const CELEBRATED_PREFIX = 'myk9:class-completion-celebrated:';
const pendingInMemory = new Set<string>();
const celebratedInMemory = new Set<string>();

type CompletedTab = 'pending' | 'completed';
type PodiumPlacement = 1 | 2 | 3 | 4;

export interface ClassCompletionPresentationProps {
  classId: string | undefined;
  classInfo: ClassInfo | null;
  entries: Entry[];
  activeTab: CompletedTab;
  onSelectCompleted: () => void;
}

export interface ClassPodiumProps {
  entries: Entry[];
}

/**
 * Record that this device just submitted the final unscored entry in a class.
 * The Completed-tab presentation consumes the intent only after the replicated
 * class confirms that results have been released.
 */
export function markClassCompletionPending(classId: string): void {
  pendingInMemory.add(classId);
  try {
    localStorage.setItem(`${PENDING_PREFIX}${classId}`, '1');
  } catch {
    // In-memory state preserves the current scoring session when storage is unavailable.
  }
}

function hasStoredFlag(prefix: string, classId: string): boolean {
  try {
    return localStorage.getItem(`${prefix}${classId}`) === '1';
  } catch {
    return false;
  }
}

function claimClassCompletionCelebration(classId: string): boolean {
  const isPending = pendingInMemory.has(classId) || hasStoredFlag(PENDING_PREFIX, classId);
  const isCelebrated = celebratedInMemory.has(classId) || hasStoredFlag(CELEBRATED_PREFIX, classId);

  if (!isPending) return false;
  if (isCelebrated) {
    pendingInMemory.delete(classId);
    try {
      localStorage.removeItem(`${PENDING_PREFIX}${classId}`);
    } catch {
      // Nothing else to do; the celebrated flag still prevents replay.
    }
    return false;
  }

  pendingInMemory.delete(classId);
  celebratedInMemory.add(classId);
  try {
    localStorage.removeItem(`${PENDING_PREFIX}${classId}`);
    localStorage.setItem(`${CELEBRATED_PREFIX}${classId}`, '1');
  } catch {
    // The module-level sets still prevent replay for this app session.
  }
  return true;
}

function isQualified(entry: Entry): boolean {
  const result = entry.resultText?.trim().toLowerCase();
  return result === 'q' || result === 'qualified';
}

function parseTime(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function minTime(values: Array<string | undefined>): number | null {
  const timestamps = values.map(parseTime).filter((value): value is number => value !== null);
  return timestamps.length > 0 ? Math.min(...timestamps) : null;
}

function maxTime(values: Array<string | undefined>): number | null {
  const timestamps = values.map(parseTime).filter((value): value is number => value !== null);
  return timestamps.length > 0 ? Math.max(...timestamps) : null;
}

function formatElapsedTime(classInfo: ClassInfo, entries: Entry[]): string {
  const start =
    parseTime(classInfo.actualStartTime) ??
    minTime(entries.map(entry => entry.ringEntryTime ?? entry.scoredAt));
  const end =
    parseTime(classInfo.actualEndTime) ??
    maxTime(entries.map(entry => entry.ringExitTime ?? entry.scoredAt));

  if (start === null || end === null || end < start) return 'Not recorded';

  const totalMinutes = Math.floor((end - start) / 60_000);
  if (totalMinutes < 1) return 'Less than a minute';

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  if (minutes === 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${hours} hour${hours === 1 ? '' : 's'} ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

const positionStyle: Record<
  PodiumPlacement,
  {
    label: string;
    order: string;
    medal: string;
    platform: string;
    height: string;
  }
> = {
  1: {
    label: '1st',
    order: 'order-2',
    medal: 'border-[#ffd700] bg-[#ffd700]/25 text-foreground',
    platform: 'border-[#ffd700] bg-[#ffd700]/25',
    height: 'h-24',
  },
  2: {
    label: '2nd',
    order: 'order-1',
    medal: 'border-[#c0c0c0] bg-[#c0c0c0]/25 text-foreground',
    platform: 'border-[#c0c0c0] bg-[#c0c0c0]/25',
    height: 'h-20',
  },
  3: {
    label: '3rd',
    order: 'order-3',
    medal: 'border-[#cd7f32] bg-[#cd7f32]/25 text-foreground',
    platform: 'border-[#cd7f32] bg-[#cd7f32]/25',
    height: 'h-16',
  },
  4: {
    label: '4th',
    order: 'order-4',
    medal: 'border-border bg-muted text-foreground',
    platform: 'border-border bg-muted',
    height: 'h-12',
  },
};

/** Released-placement presentation, reusable without the celebration trigger. */
export function ClassPodium({ entries }: ClassPodiumProps) {
  const placedEntries = entries
    .filter(
      (entry): entry is Entry & { placement: PodiumPlacement } =>
        entry.isScored &&
        entry.placement !== undefined &&
        entry.placement >= 1 &&
        entry.placement <= 4
    )
    .sort((a, b) => a.placement - b.placement);

  return (
    <section
      aria-label="Class podium"
      className="mb-4 overflow-hidden rounded-xl border border-border bg-card shadow-sm"
    >
      <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background">
          <Trophy className="h-5 w-5 text-primary" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">The Podium</h2>
          <p className="text-sm text-muted-foreground">Official released placements</p>
        </div>
      </div>

      {placedEntries.length > 0 ? (
        <div className="overflow-x-auto">
          <ol className="flex min-w-[38rem] items-end justify-center gap-3 px-4 pb-4 pt-8">
            {placedEntries.map(entry => {
              const style = positionStyle[entry.placement];
              return (
                <li
                  key={entry.id}
                  data-testid="podium-position"
                  className={`flex w-36 shrink-0 flex-col items-stretch text-center ${style.order}`}
                >
                  <div className="relative rounded-xl border border-border bg-background px-3 pb-3 pt-7 shadow-sm">
                    <span
                      className={`absolute left-1/2 top-0 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full border-2 text-sm font-bold shadow-md ${style.medal}`}
                    >
                      <span
                        className="absolute inset-1 rounded-full bg-gradient-to-br from-background/70 via-transparent to-transparent"
                        aria-hidden="true"
                      />
                      <span className="relative">{style.label}</span>
                    </span>
                    <p className="truncate text-base font-bold text-foreground">{entry.callName}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {entry.handler}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{entry.breed}</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">#{entry.armband}</p>
                  </div>
                  <div
                    className={`${style.height} relative mt-2 overflow-hidden rounded-t-lg border-x border-t ${style.platform}`}
                    aria-hidden="true"
                  >
                    <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-background/70 to-transparent" />
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          No placements were awarded.
        </p>
      )}
    </section>
  );
}

function fireCompletionConfetti(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // INTENT: MYK9-80 explicitly permits this one-time completion flourish because it
  // marks a meaningful show-day milestone; it never replays and reduced motion disables it.
  const burst = confetti.create(undefined, { useWorker: false });
  void burst({
    particleCount: 90,
    spread: 75,
    startVelocity: 35,
    origin: { y: 0.35 },
    colors: ['#ffd700', '#c0c0c0', '#cd7f32'],
  });
}

/**
 * Released podium plus the one-time final-score celebration for a single class.
 * This stays in ringside so the presentation and trigger semantics remain host-agnostic.
 */
export function ClassCompletionPresentation({
  classId,
  classInfo,
  entries,
  activeTab,
  onSelectCompleted,
}: ClassCompletionPresentationProps) {
  const [showCelebration, setShowCelebration] = useState(false);
  const claimedRef = useRef(false);
  const isFinalized = classInfo?.isScoringFinalized === true;
  const resultsReleased = Boolean(classInfo?.resultsReleasedAt);
  const isPresentationReady = isFinalized && resultsReleased;
  const scoredCount = useMemo(() => entries.filter(entry => entry.isScored).length, [entries]);
  const qualifiedCount = useMemo(() => entries.filter(isQualified).length, [entries]);
  const elapsedTime = useMemo(
    () => (classInfo ? formatElapsedTime(classInfo, entries) : null),
    [classInfo, entries]
  );

  useEffect(() => {
    if (
      !classId ||
      !classInfo ||
      !isPresentationReady ||
      claimedRef.current ||
      !claimClassCompletionCelebration(classId)
    ) {
      return;
    }

    claimedRef.current = true;
    onSelectCompleted();
    setShowCelebration(true);
    fireCompletionConfetti();
  }, [classId, classInfo, isPresentationReady, onSelectCompleted]);

  return (
    <div className="relative">
      {showCelebration && classInfo ? (
        <section
          role="region"
          aria-live="polite"
          aria-labelledby="class-complete-title"
          className="relative z-10 mb-4 rounded-2xl border border-border bg-card p-6 text-center shadow-lg"
        >
          <button
            type="button"
            aria-label="Close celebration"
            className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setShowCelebration(false)}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Trophy className="h-7 w-7 text-primary" aria-hidden="true" />
          </div>
          <h2 id="class-complete-title" className="mt-4 text-2xl font-bold text-foreground">
            Class complete
          </h2>
          <p className="mt-2 text-base text-muted-foreground">{classInfo.className} is complete.</p>
          <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-muted p-3">
              <dd className="text-lg font-bold text-foreground">{scoredCount}</dd>
              <dt className="text-sm text-muted-foreground">entries scored</dt>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <dd className="text-lg font-bold text-foreground">{qualifiedCount}</dd>
              <dt className="text-sm text-muted-foreground">qualified</dt>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <dd className="text-lg font-bold text-foreground">{elapsedTime}</dd>
              <dt className="text-sm text-muted-foreground">elapsed</dt>
            </div>
          </dl>
          <button
            type="button"
            className="mt-6 min-h-11 w-full rounded-lg bg-primary px-4 py-2.5 text-base font-semibold text-primary-foreground"
            onClick={() => setShowCelebration(false)}
          >
            View podium
          </button>
        </section>
      ) : null}

      {activeTab === 'completed' && isPresentationReady ? <ClassPodium entries={entries} /> : null}
    </div>
  );
}
