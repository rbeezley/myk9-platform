/* scentwork-secretary.jsx — Scent Work class run sheet + result entry */
/* global React, SW_SHOW, SW_CLASSES, SW_ENTRIES, SW_DOGS, swGetClass, swGetDog, swGetTrial, swGetEntriesForClass, swGetElement,
   Icon, Button, Chip, Card, PhotoPlaceholder, SecretaryPageShell, MY_SHOWS, PageHeader */
const { useState: swsState } = React;

// ============================================================
//  ClassRunSheet — the secretary's magic page.
//  One page that does: check-in, run order, inline result entry.
// ============================================================
function ClassRunSheet({ classId = 'c_t1a_cn' }) {
  const cls = swGetClass(classId);
  const element = swGetElement(cls.element);
  const { trial, day } = swGetTrial(cls.trialId);
  const initialEntries = swGetEntriesForClass(classId);
  const [entries, setEntries] = swsState(initialEntries);
  const [expandedId, setExpandedId] = swsState(null);
  const [classStatus, setClassStatus] = swsState('in-progress'); // not-started | in-progress | finished
  const [sortMode, setSortMode] = swsState('runOrder');

  // Context: the active show is the Scent Work show, synthesized to match My Shows shape
  const activeShow = {
    id: SW_SHOW.id, name: SW_SHOW.name, dateRange: SW_SHOW.dateRange,
    month: SW_SHOW.month, day: SW_SHOW.day, palette: SW_SHOW.palette,
    entries: 486, trials: 4, classes: 32, judges: 2,
    phase: 'live',
  };

  const checkedIn = entries.filter(e => e.status === 'checked-in' || e.status === 'finished').length;
  const finished = entries.filter(e => e.status === 'finished').length;
  const scratched = entries.filter(e => e.status === 'scratched').length;

  // Sort helpers
  const sorted = [...entries].sort((a, b) => {
    if (sortMode === 'armband-asc') return swGetDog(a.dogId).armband - swGetDog(b.dogId).armband;
    if (sortMode === 'armband-desc') return swGetDog(b.dogId).armband - swGetDog(a.dogId).armband;
    return a.runOrder - b.runOrder;
  });

  const updateEntry = (id, patch) => {
    setEntries(es => es.map(e => e.id === id ? { ...e, ...patch } : e));
  };

  return (
    <SecretaryPageShell
      activeShow={activeShow}
      sidebarActive="classes"
      crumbs={['My shows', SW_SHOW.name, day.label, trial.label, `${element.label} ${cls.level}`]}
    >
      {/* Class header */}
      <div style={{
        background: '#fff', border: '1px solid var(--ivory-200)', borderRadius: 16,
        padding: '24px 28px', marginBottom: 20,
        display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 24, alignItems: 'center',
      }}>
        <ElementGlyph element={element} size={80} />
        <div>
          <div style={{ fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--stone-600)', fontWeight: 600 }}>
            {trial.label} · {day.label}
          </div>
          <h1 className="serif" style={{ fontSize: 40, margin: '4px 0 6px', lineHeight: 1.05 }}>
            {element.label} · {cls.level} <span style={{ color: 'var(--stone-500)', fontSize: 28, fontWeight: 400 }}>§{cls.section}</span>
          </h1>
          <div style={{ display: 'flex', gap: 18, fontSize: 15, color: 'var(--stone-700)', flexWrap: 'wrap' }}>
            <span><strong>{cls.ring}</strong></span>
            <span style={{ color: 'var(--stone-400)' }}>·</span>
            <span>Judge {cls.judge}</span>
            <span style={{ color: 'var(--stone-400)' }}>·</span>
            <span>Start {cls.startTime}</span>
            <span style={{ color: 'var(--stone-400)' }}>·</span>
            <span>Time limit {cls.timeLimit}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <Chip variant="stone" icon="users">{entries.length} entries</Chip>
            <Chip variant="green" icon="check-circle-2">{checkedIn} checked in</Chip>
            <Chip variant="teal" icon="flag">{finished} finished</Chip>
            {scratched > 0 && <Chip variant="red" icon="x">{scratched} scratched</Chip>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {classStatus === 'not-started' && (
            <Button size="xl" icon="play-circle" onClick={() => setClassStatus('in-progress')}
              style={{ background: 'var(--terracotta-500)', borderColor: 'var(--terracotta-500)', color: '#fff' }}>Start class</Button>
          )}
          {classStatus === 'in-progress' && (
            <Button size="xl" icon="check-circle-2" onClick={() => setClassStatus('finished')}
              style={{ background: '#0d9488', borderColor: '#0d9488', color: '#fff' }}>Close class</Button>
          )}
          {classStatus === 'finished' && (
            <Chip variant="green" size="lg" icon="check-circle-2">Class closed</Chip>
          )}
          <Button size="md" variant="secondary" icon="printer">Print run sheet</Button>
        </div>
      </div>

      {/* Run order controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16,
        background: 'var(--ivory-100)', border: '1px solid var(--ivory-200)',
        borderRadius: 14, padding: '12px 18px',
      }}>
        <Icon name="list-ordered" size={20} style={{ color: 'var(--stone-600)' }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-900)' }}>Run order</div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
          <RunOrderChip label="Custom" active={sortMode === 'runOrder'} onClick={() => setSortMode('runOrder')} />
          <RunOrderChip label="Armband ↑" active={sortMode === 'armband-asc'} onClick={() => setSortMode('armband-asc')} />
          <RunOrderChip label="Armband ↓" active={sortMode === 'armband-desc'} onClick={() => setSortMode('armband-desc')} />
          <RunOrderChip label="Random" onClick={() => {
            const shuffled = [...entries].sort(() => Math.random() - 0.5).map((e, i) => ({ ...e, runOrder: i + 1 }));
            setEntries(shuffled); setSortMode('runOrder');
          }} />
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 13, color: 'var(--stone-600)' }}>
          <Icon name="move" size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Drag rows to reorder manually
        </div>
      </div>

      {/* The run sheet */}
      <div style={{ display: 'grid', gap: 10 }}>
        {sorted.map((entry, idx) => (
          <RunSheetRow
            key={entry.id}
            entry={entry}
            position={idx + 1}
            expanded={expandedId === entry.id}
            onToggleExpand={() => setExpandedId(x => x === entry.id ? null : entry.id)}
            onCheckIn={() => updateEntry(entry.id, { status: entry.status === 'checked-in' ? 'pending' : 'checked-in' })}
            onScratch={() => updateEntry(entry.id, { status: entry.status === 'scratched' ? 'pending' : 'scratched' })}
            onSaveResult={(result) => updateEntry(entry.id, { result, status: 'finished' })}
            canReorder={sortMode === 'runOrder'}
            palette={element.palette}
          />
        ))}
      </div>
    </SecretaryPageShell>
  );
}

// ----- Element glyph for class header -----
function ElementGlyph({ element, size = 64 }) {
  const palettes = {
    teal: ['#ccfbf1', '#0d9488'],
    terracotta: ['#fef3c7', '#c96442'],
    amber: ['#fde68a', '#d97706'],
    green: ['#d1fae5', '#059669'],
  };
  const [c1, c2] = palettes[element.palette] || palettes.teal;
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 4,
      background: `linear-gradient(135deg, ${c1}, ${c2})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', flexShrink: 0,
    }}>
      <Icon name={element.icon} size={size * 0.5} />
    </div>
  );
}

function RunOrderChip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: 999,
      border: active ? '1px solid var(--terracotta-500)' : '1px solid var(--ivory-200)',
      background: active ? 'var(--terracotta-500)' : '#fff',
      color: active ? '#fff' : 'var(--stone-700)',
      fontSize: 13, fontWeight: 600, cursor: 'pointer',
    }}>{label}</button>
  );
}

// ============================================================
//  RunSheetRow — a single entry.
//  Collapsed: check-in toggle, scratch, "Enter result"
//  Expanded: inline result entry form (qualified, time, faults, placement, notes)
// ============================================================
function RunSheetRow({ entry, position, expanded, onToggleExpand, onCheckIn, onScratch, onSaveResult, canReorder, palette }) {
  const dog = swGetDog(entry.dogId);
  const isFinished = entry.status === 'finished';
  const isScratched = entry.status === 'scratched';
  const isCheckedIn = entry.status === 'checked-in' || isFinished;

  return (
    <div style={{
      background: '#fff',
      border: isFinished ? '1px solid #bbf7d0' : isScratched ? '1px solid #fecaca' : '1px solid var(--ivory-200)',
      borderRadius: 14,
      overflow: 'hidden',
      opacity: isScratched ? 0.65 : 1,
    }}>
      {/* Collapsed row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '28px 56px 56px 1fr auto auto',
        gap: 16, alignItems: 'center',
        padding: '14px 18px',
      }}>
        {/* Drag handle */}
        <div style={{ color: canReorder ? 'var(--stone-400)' : 'var(--ivory-200)', cursor: canReorder ? 'grab' : 'not-allowed' }}>
          <Icon name="grip-vertical" size={20} />
        </div>

        {/* Position # */}
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: isFinished ? '#dcfce7' : isScratched ? 'var(--ivory-100)' : 'var(--ivory-100)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700,
          color: isFinished ? 'var(--chip-green-fg)' : 'var(--ink-900)',
        }}>
          {isScratched ? '–' : position}
        </div>

        {/* Dog avatar */}
        <PhotoPlaceholder initials={dog.name[0]} aspect="1 / 1" rounded={12} palette={dog.palette} />

        {/* Dog info */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-900)' }}>{dog.name}</div>
            <div style={{ fontSize: 14, color: 'var(--stone-600)' }}>{dog.regName}</div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--stone-600)', marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span><Icon name="hash" size={12} style={{ verticalAlign: 'middle' }} /> Armband <strong style={{ fontFamily: 'var(--font-mono)' }}>{dog.armband}</strong></span>
            <span>·</span>
            <span>{dog.breed}</span>
            <span>·</span>
            <span>{dog.owner}</span>
          </div>
        </div>

        {/* Status + result summary */}
        <div>
          {isFinished && entry.result && (
            <ResultBadge result={entry.result} />
          )}
          {isScratched && (
            <Chip variant="red" icon="x">Scratched</Chip>
          )}
          {!isFinished && !isScratched && (
            <CheckInButton checkedIn={isCheckedIn} onToggle={onCheckIn} />
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          {!isScratched && (
            <Button
              size="md"
              variant={isFinished ? 'secondary' : 'primary'}
              icon={isFinished ? 'pencil' : 'clipboard-check'}
              onClick={onToggleExpand}
              style={isFinished ? {} : { background: 'var(--terracotta-500)', borderColor: 'var(--terracotta-500)', color: '#fff' }}
            >
              {isFinished ? 'Edit result' : 'Enter result'}
            </Button>
          )}
          <button onClick={onScratch} style={{
            width: 44, height: 44, borderRadius: 10,
            border: '1px solid var(--ivory-200)', background: '#fff',
            color: isScratched ? 'var(--chip-red-fg)' : 'var(--stone-500)',
            cursor: 'pointer',
          }} aria-label={isScratched ? 'Unscratch' : 'Scratch'} title={isScratched ? 'Unscratch' : 'Scratch entry'}>
            <Icon name={isScratched ? 'rotate-ccw' : 'x'} size={18} />
          </button>
        </div>
      </div>

      {/* Expanded — inline result entry */}
      {expanded && !isScratched && (
        <ResultEntryForm
          initial={entry.result}
          dog={dog}
          timeLimit={'2:00'}
          onCancel={onToggleExpand}
          onSave={(r) => { onSaveResult(r); onToggleExpand(); }}
        />
      )}
    </div>
  );
}

// ----- Check-in toggle (big, tap-friendly) -----
function CheckInButton({ checkedIn, onToggle }) {
  return (
    <button onClick={onToggle} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '8px 14px', minHeight: 40,
      borderRadius: 999,
      border: checkedIn ? '1px solid #bbf7d0' : '1px solid var(--ivory-200)',
      background: checkedIn ? '#dcfce7' : '#fff',
      color: checkedIn ? 'var(--chip-green-fg)' : 'var(--stone-700)',
      fontSize: 14, fontWeight: 600, cursor: 'pointer',
    }}>
      <Icon name={checkedIn ? 'check-circle-2' : 'circle'} size={18} />
      {checkedIn ? 'Checked in' : 'Check in'}
    </button>
  );
}

// ----- Result summary (shown when class result exists) -----
function ResultBadge({ result }) {
  if (result.qualified) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Chip variant="green" icon="check-circle-2">Qualified</Chip>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--ink-900)' }}>{result.time}</div>
        {result.placement <= 4 && (
          <div style={{
            background: ['#fbbf24', '#9ca3af', '#d97706', '#6366f1'][result.placement - 1],
            color: '#fff', borderRadius: 999,
            padding: '2px 10px', fontSize: 13, fontWeight: 700,
          }}>{ordinal(result.placement)}</div>
        )}
      </div>
    );
  }
  return <Chip variant="red" icon="x-circle">Not qualified</Chip>;
}

function ordinal(n) { return ['1st','2nd','3rd','4th'][n-1] || `${n}th`; }

// ============================================================
//  ResultEntryForm — inline, expand-in-place
// ============================================================
function ResultEntryForm({ initial, dog, timeLimit, onCancel, onSave }) {
  const [qualified, setQualified] = swsState(initial?.qualified ?? true);
  const [time, setTime] = swsState(initial?.time || '');
  const [faults, setFaults] = swsState(initial?.faults ?? 0);
  const [placement, setPlacement] = swsState(initial?.placement ?? '');
  const [notes, setNotes] = swsState(initial?.notes || '');

  return (
    <div style={{
      background: 'var(--terracotta-50)',
      borderTop: '1px solid var(--terracotta-200)',
      padding: '22px 26px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Icon name="clipboard-check" size={22} style={{ color: 'var(--terracotta-600)' }} />
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 500 }}>Enter result for {dog.name}</div>
        <div style={{ fontSize: 13, color: 'var(--stone-600)' }}>· Time limit {timeLimit}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 16, marginBottom: 14 }}>
        {/* Qualified toggle — the big one */}
        <div>
          <FieldLabel>Result</FieldLabel>
          <div style={{ display: 'flex', gap: 8 }}>
            <QualToggle active={qualified === true} color="green" onClick={() => setQualified(true)}>
              <Icon name="check-circle-2" size={18} />
              Qualified
            </QualToggle>
            <QualToggle active={qualified === false} color="red" onClick={() => setQualified(false)}>
              <Icon name="x-circle" size={18} />
              NQ
            </QualToggle>
          </div>
        </div>

        {/* Search time */}
        <div>
          <FieldLabel>Search time</FieldLabel>
          <input
            value={time}
            onChange={e => setTime(e.target.value)}
            placeholder="00:00.00"
            style={{
              width: '100%', height: 52, padding: '0 16px',
              fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 700,
              border: '1px solid var(--ivory-200)', borderRadius: 12,
              background: '#fff', outline: 'none',
            }}
          />
        </div>

        {/* Faults */}
        <div>
          <FieldLabel>Faults</FieldLabel>
          <Stepper value={faults} onChange={setFaults} />
        </div>

        {/* Placement */}
        <div>
          <FieldLabel>Placement</FieldLabel>
          <div style={{ display: 'flex', gap: 6 }}>
            {['', 1, 2, 3, 4].map((p, i) => (
              <button key={i} onClick={() => setPlacement(p)} style={{
                height: 52, minWidth: 48, flex: 1,
                borderRadius: 12,
                border: placement === p ? '1px solid var(--terracotta-500)' : '1px solid var(--ivory-200)',
                background: placement === p ? 'var(--terracotta-500)' : '#fff',
                color: placement === p ? '#fff' : 'var(--stone-700)',
                fontSize: 16, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
              }}>{p === '' ? '–' : p}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 18 }}>
        <FieldLabel>Notes <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--stone-500)' }}>(optional)</span></FieldLabel>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="e.g. Handler needed second cue, but dog hit correctly on container #3."
          rows={2}
          style={{
            width: '100%', padding: '12px 16px',
            fontSize: 15, fontFamily: 'inherit',
            border: '1px solid var(--ivory-200)', borderRadius: 12,
            background: '#fff', outline: 'none', resize: 'vertical',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Button size="md" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button size="md" icon="check" onClick={() => onSave({
          qualified: qualified === true, time, faults,
          placement: placement === '' ? null : Number(placement), notes
        })} style={{ background: 'var(--terracotta-500)', borderColor: 'var(--terracotta-500)', color: '#fff' }}>
          Save result
        </Button>
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return <div style={{ fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--stone-600)', fontWeight: 700, marginBottom: 8 }}>{children}</div>;
}

function QualToggle({ active, color, onClick, children }) {
  const colors = { green: { bg: '#059669', tint: '#dcfce7' }, red: { bg: '#dc2626', tint: '#fee2e2' } };
  const c = colors[color];
  return (
    <button onClick={onClick} style={{
      flex: 1, height: 52, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      borderRadius: 12,
      border: active ? `1px solid ${c.bg}` : '1px solid var(--ivory-200)',
      background: active ? c.bg : '#fff',
      color: active ? '#fff' : 'var(--stone-700)',
      fontSize: 15, fontWeight: 700, cursor: 'pointer',
    }}>
      {children}
    </button>
  );
}

function Stepper({ value, onChange }) {
  return (
    <div style={{ display: 'flex', height: 52, border: '1px solid var(--ivory-200)', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
      <button onClick={() => onChange(Math.max(0, value - 1))} style={{ width: 52, border: 0, background: 'transparent', fontSize: 24, fontWeight: 700, color: 'var(--stone-600)', cursor: 'pointer' }}>−</button>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{value}</div>
      <button onClick={() => onChange(value + 1)} style={{ width: 52, border: 0, background: 'transparent', fontSize: 24, fontWeight: 700, color: 'var(--stone-600)', cursor: 'pointer' }}>+</button>
    </div>
  );
}

// ============================================================
//  Secretary Entries page — with stacked Day → Trial → Element → Level drill-down
// ============================================================
function SecretaryClassesDrilldown() {
  const [dayId, setDayId] = swsState('day1');
  const [trialId, setTrialId] = swsState('t1a');
  const [elementFilter, setElementFilter] = swsState(null); // null = all elements
  const [levelFilter, setLevelFilter] = swsState(null);

  const activeShow = {
    id: SW_SHOW.id, name: SW_SHOW.name, dateRange: SW_SHOW.dateRange,
    month: SW_SHOW.month, day: SW_SHOW.day, palette: SW_SHOW.palette,
    entries: 486, trials: 4, classes: 32, judges: 2,
    phase: 'live',
  };

  const day = SW_SHOW.days.find(d => d.id === dayId);
  const trialOptions = day.trials;
  let classes = SW_CLASSES.filter(c => c.trialId === trialId);
  if (elementFilter) classes = classes.filter(c => c.element === elementFilter);
  if (levelFilter) classes = classes.filter(c => c.level === levelFilter);

  return (
    <SecretaryPageShell
      activeShow={activeShow}
      sidebarActive="classes"
      crumbs={['My shows', SW_SHOW.name, 'Classes']}
    >
      <PageHeader
        eyebrow="Classes across all trials in this show"
        title="Classes"
        subtitle="Drill down: pick a day, then a trial, then narrow by element or level. Tap any class to open the run sheet."
      />

      {/* Stacked drill-down */}
      <div style={{ background: '#fff', border: '1px solid var(--ivory-200)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <DrillLevel label="1 · Day" icon="calendar">
          {SW_SHOW.days.map(d => (
            <DrillPill key={d.id} active={dayId === d.id} onClick={() => { setDayId(d.id); setTrialId(d.trials[0].id); }}>
              {d.label}
            </DrillPill>
          ))}
        </DrillLevel>
        <DrillLevel label="2 · Trial" icon="trophy">
          {trialOptions.map(t => (
            <DrillPill key={t.id} active={trialId === t.id} onClick={() => setTrialId(t.id)}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{t.label}</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>{t.time} · {t.judge}</div>
              </div>
            </DrillPill>
          ))}
        </DrillLevel>
        <DrillLevel label="3 · Element (optional)" icon="sparkles">
          <DrillPill active={!elementFilter} onClick={() => setElementFilter(null)}>All</DrillPill>
          {SW_ELEMENTS.map(el => (
            <DrillPill key={el.key} active={elementFilter === el.key} onClick={() => setElementFilter(el.key)}>
              <Icon name={el.icon} size={14} />
              {el.label}
            </DrillPill>
          ))}
        </DrillLevel>
        <DrillLevel label="4 · Level (optional)" icon="layers">
          <DrillPill active={!levelFilter} onClick={() => setLevelFilter(null)}>All</DrillPill>
          {SW_LEVELS.map(l => (
            <DrillPill key={l} active={levelFilter === l} onClick={() => setLevelFilter(l)}>{l}</DrillPill>
          ))}
        </DrillLevel>
      </div>

      {/* Class list */}
      <div style={{ fontSize: 13, color: 'var(--stone-600)', marginBottom: 12 }}>
        Showing <strong>{classes.length} classes</strong> in {day.label} · {trialOptions.find(t => t.id === trialId).label}
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {classes.map(c => <ClassListRow key={c.id} cls={c} />)}
        {classes.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--stone-500)' }}>No classes match these filters.</div>
        )}
      </div>
    </SecretaryPageShell>
  );
}

function DrillLevel({ label, icon, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, minHeight: 44 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 180, fontSize: 13, fontWeight: 600, color: 'var(--stone-700)' }}>
        <Icon name={icon} size={16} style={{ color: 'var(--stone-500)' }} />
        {label}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
        {children}
      </div>
    </div>
  );
}

function DrillPill({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '8px 14px', minHeight: 40,
      borderRadius: 10,
      border: active ? '1px solid var(--terracotta-500)' : '1px solid var(--ivory-200)',
      background: active ? 'var(--terracotta-500)' : '#fff',
      color: active ? '#fff' : 'var(--stone-700)',
      fontSize: 14, fontWeight: 600, cursor: 'pointer',
    }}>{children}</button>
  );
}

function ClassListRow({ cls }) {
  const el = swGetElement(cls.element);
  const entries = swGetEntriesForClass(cls.id);
  const checked = entries.filter(e => e.status === 'checked-in' || e.status === 'finished').length;
  return (
    <button style={{
      width: '100%', display: 'grid', gridTemplateColumns: '56px 1fr auto auto auto', gap: 20, alignItems: 'center',
      background: '#fff', border: '1px solid var(--ivory-200)', borderRadius: 14,
      padding: '14px 18px', cursor: 'pointer', textAlign: 'left',
    }}>
      <ElementGlyph element={el} size={56} />
      <div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink-900)' }}>{el.label} · {cls.level} <span style={{ color: 'var(--stone-500)', fontWeight: 400 }}>§{cls.section}</span></div>
        <div style={{ fontSize: 13, color: 'var(--stone-600)', marginTop: 2 }}>{cls.ring} · Judge {cls.judge} · starts {cls.startTime}</div>
      </div>
      <Chip variant="stone" icon="users">{entries.length}</Chip>
      <Chip variant={checked === entries.length ? 'green' : 'amber'} icon="check-circle-2">{checked}/{entries.length} in</Chip>
      <Icon name="chevron-right" size={20} style={{ color: 'var(--stone-500)' }} />
    </button>
  );
}

Object.assign(window, {
  ClassRunSheet, SecretaryClassesDrilldown, ElementGlyph,
});
