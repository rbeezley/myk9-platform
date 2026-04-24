/* scentwork-exhibitor.jsx — Class detail (exhibitor view) + My entries grouped by dog */
/* global React, SW_SHOW, SW_CLASSES, SW_ENTRIES, SW_DOGS, swGetClass, swGetDog, swGetTrial, swGetEntriesForClass,
   swGetEntriesForDog, swGetElement, Icon, Button, Chip, Card, PhotoPlaceholder, PageShell, PageHeader */
const { useState: swxState } = React;

// Assume "Sarah Martin" is the logged-in exhibitor (owns d1 Maggie + d3 Daisy)
const MY_DOG_IDS = ['d1', 'd3'];

// ============================================================
//  ClassDetail (exhibitor) — three-state page:
//   1. Before class:   "Your dogs" callout + run order
//   2. During class:   live ring position
//   3. After class:    results callout (your dogs first, then full list)
// ============================================================
function ExhibitorClassDetail({ classId = 'c_t1a_cn', state = 'before' }) {
  const cls = swGetClass(classId);
  const el = swGetElement(cls.element);
  const { trial, day } = swGetTrial(cls.trialId);
  const entries = swGetEntriesForClass(classId);
  const myEntries = entries.filter(e => MY_DOG_IDS.includes(e.dogId));
  const isAfter = state === 'after';

  return (
    <PageShell active="entries" role="exhibitor" crumbs={['Shows', SW_SHOW.name, `${el.label} ${cls.level}`]}>
      {/* Class header */}
      <div style={{
        background: '#fff', border: '1px solid var(--ivory-200)', borderRadius: 16,
        padding: '24px 28px', marginBottom: 20,
        display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, alignItems: 'center',
      }}>
        <div style={{
          width: 100, height: 100, borderRadius: 20,
          background: paletteGradient(el.palette),
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
        }}>
          <Icon name={el.icon} size={54} />
        </div>
        <div>
          <div style={{ fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--stone-600)', fontWeight: 600 }}>
            {SW_SHOW.name} · {day.label} · {trial.label}
          </div>
          <h1 className="serif" style={{ fontSize: 44, margin: '4px 0 8px', lineHeight: 1.05 }}>
            {el.label} · {cls.level}
          </h1>
          <div style={{ display: 'flex', gap: 18, fontSize: 16, color: 'var(--stone-700)', flexWrap: 'wrap' }}>
            <span><Icon name="map-pin" size={16} style={{ verticalAlign: 'middle' }}/> {cls.ring}</span>
            <span><Icon name="user" size={16} style={{ verticalAlign: 'middle' }}/> Judge {cls.judge}</span>
            <span><Icon name="clock" size={16} style={{ verticalAlign: 'middle' }}/> {cls.startTime}</span>
            <span><Icon name="timer" size={16} style={{ verticalAlign: 'middle' }}/> Time limit {cls.timeLimit}</span>
          </div>
        </div>
      </div>

      {/* YOUR DOGS IN THIS CLASS — loud callout, adapts to before/after */}
      {myEntries.length > 0 && (
        isAfter ? <YourResults entries={myEntries} /> : <YourDogsInClass entries={myEntries} entries_all={entries} />
      )}

      {/* Run order */}
      <div style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14 }}>
          <h2 className="serif" style={{ fontSize: 28, margin: 0 }}>
            {isAfter ? 'Full class results' : 'Run order'}
          </h2>
          <span style={{ fontSize: 14, color: 'var(--stone-600)' }}>
            {entries.length} dogs{isAfter ? '' : ' · go to the ring when the previous dog is on hide #2'}
          </span>
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--ivory-200)', borderRadius: 16, overflow: 'hidden' }}>
          {entries.map((e, i) => (
            <ExhibitorRunRow
              key={e.id}
              entry={e}
              position={i + 1}
              isYours={MY_DOG_IDS.includes(e.dogId)}
              isFirst={i === 0}
              showResults={isAfter}
            />
          ))}
        </div>
      </div>
    </PageShell>
  );
}

function paletteGradient(p) {
  const palettes = {
    teal: 'linear-gradient(135deg, #ccfbf1, #0d9488)',
    terracotta: 'linear-gradient(135deg, #fef3c7, #c96442)',
    amber: 'linear-gradient(135deg, #fde68a, #d97706)',
    green: 'linear-gradient(135deg, #d1fae5, #059669)',
  };
  return palettes[p] || palettes.teal;
}

// ----- Your dogs in this class (BEFORE the class runs) -----
function YourDogsInClass({ entries, entries_all }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #fef3c7, #fff 60%)',
      border: '1px solid var(--terracotta-200)',
      borderLeft: '4px solid var(--terracotta-500)',
      borderRadius: 16, padding: '20px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Icon name="star" size={22} style={{ color: 'var(--terracotta-600)' }} />
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 500 }}>
          Your {entries.length === 1 ? 'dog' : `${entries.length} dogs`} in this class
        </div>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {entries.map((e) => {
          const dog = swGetDog(e.dogId);
          const position = entries_all.findIndex(x => x.id === e.id) + 1;
          const dogsAhead = position - 1;
          const minsAhead = dogsAhead * 3; // assume ~3 min/dog
          return (
            <div key={e.id} style={{
              display: 'grid', gridTemplateColumns: '64px 56px 1fr auto', gap: 16, alignItems: 'center',
              background: '#fff', borderRadius: 12, padding: '14px 18px',
              border: '1px solid var(--ivory-200)',
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: 'var(--ivory-100)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: 'var(--ink-900)',
              }}>#{position}</div>
              <PhotoPlaceholder initials={dog.name[0]} aspect="1 / 1" rounded={12} palette={dog.palette} />
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink-900)' }}>{dog.name}</div>
                <div style={{ fontSize: 14, color: 'var(--stone-600)' }}>Armband <strong style={{ fontFamily: 'var(--font-mono)' }}>{dog.armband}</strong> · {dog.breed}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {dogsAhead === 0
                  ? <Chip variant="red" icon="alert-circle" size="lg">You're up next!</Chip>
                  : <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--terracotta-700)' }}>~{minsAhead} min</div>
                      <div style={{ fontSize: 12, color: 'var(--stone-600)' }}>{dogsAhead} {dogsAhead === 1 ? 'dog' : 'dogs'} ahead</div>
                    </div>
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ----- Your results (AFTER the class runs) -----
function YourResults({ entries }) {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {entries.map(e => {
        const dog = swGetDog(e.dogId);
        const result = e.result || fakeResult(e.id);
        return <ResultCallout key={e.id} dog={dog} result={result} />;
      })}
    </div>
  );
}

// Synthesize a result for dogs that don't have one (demo purposes)
function fakeResult(id) {
  if (id === 'e9')  return { qualified: true,  time: '00:38.2', faults: 0, placement: 3 };
  if (id === 'e10') return { qualified: false, time: '2:00.0', faults: 2, placement: null, reason: 'Time expired' };
  if (id === 'e11') return { qualified: true,  time: '00:31.5', faults: 0, placement: 1 };
  return { qualified: true, time: '00:45.0', faults: 0, placement: 2 };
}

function ResultCallout({ dog, result }) {
  const good = result.qualified;
  return (
    <div style={{
      background: good ? 'linear-gradient(135deg, #dcfce7, #fff 60%)' : 'linear-gradient(135deg, #fee2e2, #fff 60%)',
      border: good ? '1px solid #bbf7d0' : '1px solid #fecaca',
      borderLeft: `4px solid ${good ? '#059669' : '#dc2626'}`,
      borderRadius: 16, padding: '22px 26px',
      display: 'grid', gridTemplateColumns: '72px 1fr auto', gap: 22, alignItems: 'center',
    }}>
      <PhotoPlaceholder initials={dog.name[0]} aspect="1 / 1" rounded={18} palette={dog.palette} />
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, fontWeight: 500, lineHeight: 1 }}>{dog.name}</div>
          {good
            ? <Chip variant="green" icon="check-circle-2" size="lg">QUALIFIED</Chip>
            : <Chip variant="red" icon="x-circle" size="lg">Not qualified</Chip>
          }
        </div>
        <div style={{ display: 'flex', gap: 28, marginTop: 10, flexWrap: 'wrap' }}>
          <StatBig label="Search time" value={result.time} />
          {good && <StatBig label="Faults" value={result.faults} />}
          {good && result.placement && <StatBig label="Placement" value={ordinal(result.placement)} tint="gold" />}
          {!good && result.reason && <StatBig label="Reason" value={result.reason} tint="red" />}
        </div>
      </div>
      <Button size="lg" variant="secondary" icon="file-text">Score sheet</Button>
    </div>
  );
}

function StatBig({ label, value, tint }) {
  const colors = { gold: '#b45309', red: '#991b1b', default: 'var(--ink-900)' };
  return (
    <div>
      <div style={{ fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--stone-600)' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: colors[tint] || colors.default, fontFamily: tint ? 'var(--font-serif)' : 'var(--font-mono)', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function ordinal(n) { return ['1st','2nd','3rd','4th'][n-1] || `${n}th`; }

// ----- Run order row (exhibitor view) -----
function ExhibitorRunRow({ entry, position, isYours, isFirst, showResults }) {
  const dog = swGetDog(entry.dogId);
  const result = entry.result || (showResults ? fakeResult(entry.id) : null);
  const isScratched = entry.status === 'scratched';
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '52px 44px 1fr auto', gap: 16, alignItems: 'center',
      padding: '14px 18px',
      background: isYours ? 'var(--terracotta-50)' : '#fff',
      borderBottom: '1px solid var(--ivory-100)',
      borderLeft: isYours ? '4px solid var(--terracotta-500)' : '4px solid transparent',
      opacity: isScratched ? 0.55 : 1,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: isYours ? 'var(--terracotta-500)' : 'var(--ivory-100)',
        color: isYours ? '#fff' : 'var(--ink-900)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700,
      }}>{isScratched ? '–' : position}</div>
      <PhotoPlaceholder initials={dog.name[0]} aspect="1 / 1" rounded={10} palette={dog.palette} />
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)' }}>{dog.name}</div>
          {isYours && <Chip variant="red" size="md">Yours</Chip>}
          {isFirst && !showResults && !isScratched && <Chip variant="amber" icon="flame" size="md">Running now</Chip>}
        </div>
        <div style={{ fontSize: 13, color: 'var(--stone-600)', marginTop: 2 }}>
          Armband <strong style={{ fontFamily: 'var(--font-mono)' }}>{dog.armband}</strong> · {dog.breed} · {dog.owner}
        </div>
      </div>
      <div>
        {showResults && result && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700 }}>{result.time}</span>
            {result.qualified
              ? <Chip variant="green" icon="check">Q</Chip>
              : <Chip variant="red" icon="x">NQ</Chip>
            }
            {result.placement && <span style={{
              background: ['#fbbf24', '#9ca3af', '#d97706', '#6366f1'][result.placement - 1],
              color: '#fff', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700,
            }}>{ordinal(result.placement)}</span>}
          </div>
        )}
        {isScratched && <Chip variant="stone">Scratched</Chip>}
      </div>
    </div>
  );
}

// ============================================================
//  My Entries (per show) — grouped by dog + ring schedule timeline
// ============================================================
function ExhibitorMyEntries() {
  // Get entries for Sarah's dogs, enrich with class info
  const myEntries = MY_DOG_IDS.flatMap(dogId =>
    swGetEntriesForDog(dogId).map(e => {
      const cls = swGetClass(e.classId);
      if (!cls) return null;
      const { trial, day } = swGetTrial(cls.trialId);
      return { ...e, class: cls, trial, day, dog: swGetDog(dogId), element: swGetElement(cls.element) };
    }).filter(Boolean)
  );

  // Group by dog
  const byDog = MY_DOG_IDS.map(dogId => ({
    dog: swGetDog(dogId),
    entries: myEntries.filter(e => e.dog.id === dogId),
  }));

  return (
    <PageShell active="entries" role="exhibitor" crumbs={['My entries', SW_SHOW.name]}>
      <PageHeader
        eyebrow={`Your entries at ${SW_SHOW.name}`}
        title="This weekend's schedule"
        subtitle={`${myEntries.length} entries across ${byDog.length} of your dogs. Tap any class to see run order and results.`}
        secondary={<Button size="xl" variant="secondary" icon="printer">Print my schedule</Button>}
        primary={<Button size="xl" icon="calendar-plus">Add to calendar</Button>}
      />

      {/* Ring schedule timeline */}
      <RingTimeline entries={myEntries} />

      {/* Per-dog sections */}
      <div style={{ marginTop: 32, display: 'grid', gap: 28 }}>
        {byDog.map(group => (
          <DogEntrySection key={group.dog.id} dog={group.dog} entries={group.entries} />
        ))}
      </div>
    </PageShell>
  );
}

// ----- Ring schedule mini-timeline -----
function RingTimeline({ entries }) {
  // Sort by start time (naive — string sort works for our 12h format given same day ordering)
  // We'll just list in time order within each day
  const daysMap = {};
  entries.forEach(e => {
    const key = e.day.id;
    if (!daysMap[key]) daysMap[key] = { label: e.day.label, entries: [] };
    daysMap[key].entries.push(e);
  });
  Object.values(daysMap).forEach(d => d.entries.sort((a, b) => a.class.startTime.localeCompare(b.class.startTime)));

  return (
    <div style={{
      background: '#fff', border: '1px solid var(--ivory-200)', borderRadius: 16,
      padding: '20px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Icon name="map" size={22} style={{ color: 'var(--teal-700)' }} />
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 500 }}>Where to be &amp; when</div>
      </div>
      {Object.entries(daysMap).map(([k, d]) => (
        <div key={k} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--stone-600)', marginBottom: 8, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{d.label}</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {d.entries.map(e => (
              <div key={e.id} style={{
                display: 'grid', gridTemplateColumns: '80px 40px 1fr auto auto', gap: 14, alignItems: 'center',
                padding: '10px 12px', borderRadius: 10, background: 'var(--ivory-50)',
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, color: 'var(--ink-900)' }}>{e.class.startTime}</div>
                <PhotoPlaceholder initials={e.dog.name[0]} aspect="1 / 1" rounded={8} palette={e.dog.palette} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{e.dog.name} · {e.element.label} {e.class.level}</div>
                  <div style={{ fontSize: 12, color: 'var(--stone-600)' }}>{e.trial.label} · {e.class.ring}</div>
                </div>
                {e.status === 'finished' && e.result && (
                  e.result.qualified
                    ? <Chip variant="green" icon="check">Q · {e.result.time}</Chip>
                    : <Chip variant="red" icon="x">NQ</Chip>
                )}
                {e.status !== 'finished' && <Chip variant="stone" size="md">Upcoming</Chip>}
                <Icon name="chevron-right" size={18} style={{ color: 'var(--stone-500)' }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ----- Per-dog section -----
function DogEntrySection({ dog, entries }) {
  return (
    <section>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14,
        paddingBottom: 12, borderBottom: '2px solid var(--ivory-200)',
      }}>
        <PhotoPlaceholder initials={dog.name[0]} aspect="1 / 1" rounded={14} palette={dog.palette} />
        <div style={{ flex: 1 }}>
          <h2 className="serif" style={{ fontSize: 32, margin: 0, lineHeight: 1 }}>{dog.name}</h2>
          <div style={{ fontSize: 14, color: 'var(--stone-600)', marginTop: 4 }}>{dog.regName} · Armband <strong style={{ fontFamily: 'var(--font-mono)' }}>{dog.armband}</strong></div>
        </div>
        <Chip variant="stone" icon="list-checks">{entries.length} classes</Chip>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {entries.map(e => <MyEntryRow key={e.id} entry={e} />)}
      </div>
    </section>
  );
}

function MyEntryRow({ entry }) {
  const isFinished = entry.status === 'finished';
  const result = entry.result || (isFinished ? fakeResult(entry.id) : null);
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '48px 1fr auto auto auto', gap: 16, alignItems: 'center',
      background: '#fff', border: '1px solid var(--ivory-200)', borderRadius: 14,
      padding: '14px 18px',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: paletteGradient(entry.element.palette),
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
      }}>
        <Icon name={entry.element.icon} size={24} />
      </div>
      <div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink-900)' }}>
          {entry.element.label} · {entry.class.level}
        </div>
        <div style={{ fontSize: 13, color: 'var(--stone-600)', marginTop: 2 }}>
          {entry.day.label} · {entry.class.startTime} · {entry.class.ring} · Judge {entry.class.judge}
        </div>
      </div>
      {result ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15 }}>{result.time}</span>
          {result.qualified
            ? <Chip variant="green" icon="check-circle-2">Qualified</Chip>
            : <Chip variant="red" icon="x-circle">Not qualified</Chip>
          }
          {result.placement && <span style={{
            background: ['#fbbf24', '#9ca3af', '#d97706', '#6366f1'][result.placement - 1],
            color: '#fff', borderRadius: 999, padding: '3px 12px', fontSize: 13, fontWeight: 700,
          }}>{ordinal(result.placement)}</span>}
        </div>
      ) : (
        <Chip variant="stone" icon="clock">Upcoming</Chip>
      )}
      <Button size="sm" variant="secondary" iconRight="arrow-right">View class</Button>
    </div>
  );
}

Object.assign(window, {
  ExhibitorClassDetail, ExhibitorMyEntries,
});
