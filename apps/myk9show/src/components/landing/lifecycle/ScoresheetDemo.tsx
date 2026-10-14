import { useEffect, useRef, useState } from 'react';
import { ResultChoiceChips, useStopwatch, type QualifyingResult } from '@myk9/scoring-ui';
import './scoresheetDemo.css';

// Practice dogs for the landing-page demo. Ziva and Tera are the owner's dogs (the hero photo).
export const PRACTICE_DOGS = [
  { arm: 101, name: 'Ziva', breed: 'Belgian Tervuren', handler: 'R. Beezley' },
  { arm: 102, name: 'Tera', breed: 'Dutch Shepherd', handler: 'R. Beezley' },
  { arm: 103, name: 'Juno', breed: 'Labrador Retriever', handler: 'K. Patel' },
  { arm: 104, name: 'Mosby', breed: 'Vizsla', handler: 'D. Chen' },
] as const;

const RESULT_LABEL: Record<QualifyingResult, string> = {
  Q: 'Qualified',
  NQ: 'NQ',
  ABS: 'Absent',
  EX: 'Excused',
  DQ: 'DQ',
};
// Only the newest rows are shown; the queue itself keeps every score, so none is dropped.
const VISIBLE_ROWS = 4;

type Logged = {
  arm: number;
  name: string;
  result: string;
  state: 'waiting' | 'synced';
};

// Working practice scoresheet for the landing page (canvas E2, plan D9).
// INTENT: lets a visitor feel the real behaviour (scoring keeps working with no signal and
// catches up on its own). The timer and result buttons are the real ones from
// @myk9/scoring-ui; only the venue signal and the score queue are simulated here.
// Nothing is saved, nothing goes over the network, and no ringside or sync code is imported.
export function ScoresheetDemo({ syncMs = 1400 }: { syncMs?: number }) {
  const stopwatch = useStopwatch({
    maxTime: '2:00',
    enableVoiceAnnouncements: false,
    thirtySecondWarning: false,
  });
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<QualifyingResult | null>(null);
  const [log, setLog] = useState<Logged[]>([]);
  const [message, setMessage] = useState(
    'Turn the signal off, press Start, pick a result and Save.'
  );
  const syncTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(syncTimer.current), []);

  const dog = PRACTICE_DOGS[index % PRACTICE_DOGS.length]!;
  const waiting = log.filter(l => l.state === 'waiting').length;

  const toggleSignal = () => {
    window.clearTimeout(syncTimer.current);
    if (online) {
      setOnline(false);
      setSyncing(false);
      setMessage('No signal. Keep scoring; nothing is lost.');
      return;
    }
    setOnline(true);
    if (!waiting) {
      setMessage('Signal is back.');
      return;
    }
    const n = waiting;
    setSyncing(true);
    setMessage(`Signal is back. Sending ${n}…`);
    syncTimer.current = window.setTimeout(() => {
      setLog(cur => cur.map(l => ({ ...l, state: 'synced' })));
      setSyncing(false);
      setMessage(`All ${n} synced.`);
    }, syncMs);
  };

  const saveScore = () => {
    if (!result) {
      setMessage('Pick a result first: Qualified, NQ, Absent or Excused.');
      return;
    }
    const elapsed = stopwatch.isRunning ? stopwatch.pause() : stopwatch.time;
    const timed = result === 'Q' || result === 'NQ';
    const entry: Logged = {
      arm: dog.arm,
      name: dog.name,
      result: RESULT_LABEL[result] + (timed ? ` · ${stopwatch.formatTime(elapsed)}` : ''),
      state: online ? 'synced' : 'waiting',
    };
    const next = [entry, ...log];
    setLog(next);
    stopwatch.reset();
    setResult(null);
    setIndex(i => i + 1);
    const n = next.filter(l => l.state === 'waiting').length;
    setMessage(
      online
        ? `${dog.name} saved and synced.`
        : `${dog.name} saved on the tablet. ${n} waiting for signal.`
    );
  };

  const badge = !online
    ? {
        text: waiting ? `No signal · ${waiting} waiting` : 'No signal',
        tone: 'amber',
      }
    : syncing
      ? { text: `Syncing ${waiting}…`, tone: 'blue' }
      : log.length && !waiting
        ? { text: 'All synced', tone: 'green' }
        : { text: 'Online', tone: 'neutral' };

  const maxMs = stopwatch.getMaxTimeMs();
  const remainingPct = maxMs ? Math.max(0, (stopwatch.getRemainingTimeMs() / maxMs) * 100) : 100;

  return (
    <div className="lc-demo">
      <div className="lc-demo-control">
        <button
          type="button"
          role="switch"
          aria-checked={online}
          aria-label="Venue signal"
          className="lc-demo-switch"
          onClick={toggleSignal}
        >
          <span className="lc-demo-knob" />
        </button>
        <div>
          <span className="lc-demo-label">Venue signal: {online ? 'On' : 'Off'}</span>
          <span className="lc-demo-hint">
            {waiting
              ? `${waiting} ${waiting === 1 ? 'score' : 'scores'} saved on the tablet, waiting`
              : online
                ? 'Tap to cut the signal, like a rural show site'
                : 'Scores keep saving on the tablet'}
          </span>
        </div>
      </div>

      <div className="lc-demo-tablet">
        <div className="lc-demo-screen">
          <div className="lc-demo-head">
            <div>
              <div className="lc-demo-trial">Saturday Trial</div>
              <div className="lc-demo-class">Container Novice A · practice</div>
            </div>
            <span className="lc-demo-badge" data-tone={badge.tone}>
              {badge.text}
            </span>
          </div>
          <div className="lc-demo-dog">
            <span className="lc-demo-arm">{dog.arm}</span>
            <div>
              <div className="lc-demo-dogname">{dog.name}</div>
              <div className="lc-demo-meta">
                {dog.breed} · Handler: {dog.handler}
              </div>
            </div>
          </div>
          <div className="lc-demo-timer">
            <div className="lc-demo-clock">{stopwatch.formatTime(stopwatch.time)}</div>
            <div className="lc-demo-remaining">Remaining: {stopwatch.getRemainingTime()}</div>
            <div className="lc-demo-bar">
              <div style={{ width: `${remainingPct}%` }} />
            </div>
            <button
              type="button"
              className="lc-demo-start"
              data-running={stopwatch.isRunning ? 'true' : 'false'}
              onClick={() => (stopwatch.isRunning ? stopwatch.pause() : stopwatch.start())}
            >
              {stopwatch.isRunning ? 'Stop' : stopwatch.time ? 'Resume' : 'Start'}
            </button>
          </div>
          <ResultChoiceChips selectedResult={result} onResultChange={setResult} hideFaults />
          <button
            type="button"
            className="lc-demo-save"
            data-ready={result ? 'true' : 'false'}
            onClick={saveScore}
          >
            Save
          </button>
        </div>
      </div>

      <ul className="lc-demo-log" aria-label="Scores this session">
        {log.slice(0, VISIBLE_ROWS).map((l, i) => (
          <li key={`${l.arm}-${i}`}>
            <span className="lc-demo-chip" data-state={l.state}>
              {l.state === 'waiting' ? 'Waiting' : 'Synced'}
            </span>
            #{l.arm} {l.name}: {l.result}
          </li>
        ))}
      </ul>
      <p data-testid="scoresheet-status" className="lc-demo-status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
