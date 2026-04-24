/* title-progress.jsx — Rolling title progress for the Dog detail page. */
/* global React, Card, Chip, Icon, SectionTitle */

// Title progression per element: each title requires N qualifying runs at the level below it.
// NW1 = 3 Qs at Novice. NW2 = 3 Qs at Advanced. NW3 = 3 Qs at Excellent. SMX = 3 Qs at Master.
// SMXE = 3 Qs at Detective. Handler Discrimination follows its own track (NW-HD ladder).
const TITLE_ABBR = {
  Container: ['SCN', 'SCA', 'SCE', 'SCM', 'SCD'],
  Interior:  ['SIN', 'SIA', 'SIE', 'SIM', 'SID'],
  Exterior:  ['SEN', 'SEA', 'SEE', 'SEM', 'SED'],
  Buried:    ['SBN', 'SBA', 'SBE', 'SBM', 'SBD'],
};
const LEVELS = ['Novice', 'Advanced', 'Excellent', 'Master', 'Detective'];
const REQUIRED = 3;

// Mock data — one row per in-progress track + completed list.
// In real code this would be derived from the dog's run history.
const MOCK_PROGRESS = {
  inProgress: [
    { element: 'Container', level: 'Advanced', qs: 2, lastQ: 'Apr 12 · Millbrook' },
    { element: 'Interior',  level: 'Novice',   qs: 1, lastQ: 'Mar 29 · Hudson Valley' },
    { element: 'Exterior',  level: 'Novice',   qs: 3, lastQ: 'Apr 05 · Bergen Co', justFinished: true },
  ],
  completed: [
    { element: 'Container', level: 'Novice', title: 'SCN', earned: 'Feb 22 · Cross-Creek' },
  ],
};

// ─── Pips: ●●○ for 2/3 Qs ───────────────────────────────────────────
function Pips({ filled, total = REQUIRED, color = 'var(--teal-500)' }) {
  return (
    <div style={{ display: 'inline-flex', gap: 6 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: 14, height: 14, borderRadius: '50%',
          background: i < filled ? color : 'transparent',
          border: i < filled ? `2px solid ${color}` : '2px solid var(--ivory-300)',
          transition: 'background .15s',
        }} />
      ))}
    </div>
  );
}

// ─── One row — element/level label, pips, Qs count, last Q date ────
function TitleRow({ track }) {
  const abbr = TITLE_ABBR[track.element]?.[LEVELS.indexOf(track.level)] || '—';
  const nextTitleName = `${track.element} ${track.level}`;
  const done = track.justFinished;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '220px 1fr auto',
      alignItems: 'center',
      gap: 20,
      padding: '14px 16px',
      borderTop: '1px solid var(--ivory-200)',
    }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-900)' }}>{nextTitleName}</div>
        <div style={{ fontSize: 13, color: 'var(--stone-600)', marginTop: 2 }}>
          Toward <span className="mono" style={{ fontWeight: 600 }}>{abbr}</span> title
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Pips filled={track.qs} color={done ? 'var(--chip-green-fg, #166534)' : 'var(--teal-500, #14b8a6)'} />
        <span className="mono" style={{ fontSize: 15, fontWeight: 600, color: 'var(--stone-700)' }}>
          {track.qs}/{REQUIRED} Qs
        </span>
        {done && <Chip variant="green" size="sm">Title earned!</Chip>}
      </div>
      <div style={{ fontSize: 13, color: 'var(--stone-600)', textAlign: 'right' }}>
        <div style={{ color: 'var(--stone-500)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Last Q</div>
        <div style={{ marginTop: 2 }}>{track.lastQ}</div>
      </div>
    </div>
  );
}

// ─── Completed title chip ─────────────────────────────────────────
function CompletedTitle({ item }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      padding: '8px 14px 8px 10px',
      background: 'var(--chip-green-bg)',
      border: '1px solid #bbf7d0',
      borderRadius: 999,
      fontSize: 14,
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: '50%',
        background: 'var(--chip-green-fg)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="check" size={14} />
      </div>
      <span className="mono" style={{ fontWeight: 700, color: 'var(--chip-green-fg)' }}>{item.title}</span>
      <span style={{ color: 'var(--stone-600)' }}>· {item.element} {item.level}</span>
      <span style={{ color: 'var(--stone-500)', fontSize: 12 }}>· {item.earned}</span>
    </div>
  );
}

// ─── The full card ────────────────────────────────────────────────
function TitleProgress({ dogName = 'this dog', data = MOCK_PROGRESS }) {
  return (
    <Card style={{ padding: 0, marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ padding: '20px 22px 6px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <SectionTitle title="Title progress" sub={`How close ${dogName} is to the next title in each track`} />
        </div>
        <span className="eyebrow">Scent work</span>
      </div>

      <div style={{ padding: '0 6px' }}>
        {data.inProgress.map((track, i) => (
          <TitleRow key={i} track={track} />
        ))}
      </div>

      {data.completed.length > 0 && (
        <div style={{ padding: '16px 22px 22px', borderTop: '1px solid var(--ivory-200)', background: 'var(--ivory-100, #f7f5ee)' }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Titles earned</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {data.completed.map((c, i) => <CompletedTitle key={i} item={c} />)}
          </div>
        </div>
      )}
    </Card>
  );
}

Object.assign(window, { TitleProgress });
