// myK9Q v2 screens — terracotta-led, theatrical in-ring, rosette motif
// Primary lead: terracotta. Green = live/in-ring only.

function ScreenHomeV2({ onOpenClass }) {
  const [tab, setTab] = React.useState('All');
  const classes = [
    { id: 1, name: 'Novice A — Obedience',  ring: 'Ring 2', time: '8:30 AM', entries: 12, done: 4, status: 'active' },
    { id: 2, name: 'Open B — Obedience',    ring: 'Ring 2', time: '9:45 AM', entries: 18, done: 0, status: 'next' },
    { id: 3, name: 'Rally Excellent',       ring: 'Ring 3', time: '10:30 AM', entries: 22, done: 0, status: 'upcoming' },
    { id: 4, name: 'Utility B',              ring: 'Ring 2', time: '1:00 PM',  entries: 9,  done: 0, status: 'upcoming' },
  ];
  return (
    <div style={{ background: Q.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <QHeader
        title="Bergen County KC"
        subtitle="Sat · Apr 26, 2026 · 486 entries"
        left={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={Q.terra} strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>}
        right={<div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg,${Q.terra},${Q.terraInk})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>SM</div>}
      />

      {/* Status strip */}
      <div style={{ margin: '4px 16px 14px', padding: '14px 16px', background: '#fff', borderRadius: 16, display: 'flex', gap: 16, boxShadow: '0 1px 2px rgba(61,37,22,.04),0 4px 16px rgba(61,37,22,.04)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: Q.sec, letterSpacing: 0.6, fontWeight: 600, textTransform: 'uppercase' }}>YOUR DOGS</div>
          <div style={{ fontFamily: Q.mono, fontSize: 22, fontWeight: 700, color: Q.text, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>3<span style={{ fontSize: 14, color: Q.sec, fontWeight: 500 }}> / 5</span></div>
        </div>
        <div style={{ width: 1, background: Q.sep }}/>
        <div style={{ flex: 1.3 }}>
          <div style={{ fontSize: 11, color: Q.sec, letterSpacing: 0.6, fontWeight: 600, textTransform: 'uppercase' }}>UP NEXT</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: Q.text, marginTop: 2 }}>Armband 247</div>
          <div style={{ fontSize: 11, color: Q.terra, fontWeight: 600 }}>Ring 2 · 2 away</div>
        </div>
      </div>

      <QSegmented options={['All', 'My ring', 'Favorites']} value={tab} onChange={setTab}/>

      <div style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, color: Q.sec, letterSpacing: 0.8, fontWeight: 700, textTransform: 'uppercase' }}>CLASSES TODAY</div>
        <div style={{ fontSize: 12, color: Q.terra, fontWeight: 600 }}>Sort</div>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {classes.map(c => (
          <div key={c.id} onClick={() => onOpenClass(c)} style={{
            background: '#fff', borderRadius: 14, padding: '14px 16px',
            boxShadow: '0 1px 2px rgba(61,37,22,.04),0 4px 16px rgba(61,37,22,.04)',
            cursor: 'pointer',
            border: c.status === 'active' ? `1.5px solid ${Q.live}` : 'none',
            position: 'relative', overflow: 'hidden',
          }}>
            {c.status === 'active' && (
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: Q.live }}/>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: Q.text, letterSpacing: -0.2 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: Q.sec, marginTop: 3 }}>{c.ring} · {c.time}</div>
              </div>
              {c.status === 'active' && <QBadge tone="live">● JUDGING</QBadge>}
              {c.status === 'next' && <QBadge tone="terra">NEXT</QBadge>}
            </div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 4, background: '#f3efe6', borderRadius: 9999, overflow: 'hidden' }}>
                <div style={{ width: `${(c.done/c.entries)*100}%`, height: '100%', background: c.status === 'active' ? Q.live : Q.terra }}/>
              </div>
              <div style={{ fontFamily: Q.mono, fontSize: 12, color: Q.sec, fontVariantNumeric: 'tabular-nums' }}>
                {c.done}/{c.entries}
              </div>
            </div>
          </div>
        ))}
      </div>
      <QTabBar active="home"/>
    </div>
  );
}

function ScreenEntriesV2({ cls, onOpenEntry, onBack }) {
  const entries = [
    { a: 241, n: "Copperfield's Remember When",    b: 'Golden Retriever',   h: 'J. Wallace', s: 'done', p: 1 },
    { a: 243, n: "Stormwatch's Midnight Runner",   b: 'Border Collie',      h: 'A. Chen',    s: 'done', p: 2 },
    { a: 244, n: "Blackthorn's Aurora Borealis",   b: 'Shetland Sheepdog',  h: 'K. Patel',   s: 'done', p: 3 },
    { a: 247, n: "Dewfall's Song of the Moor",     b: 'Border Collie',      h: 'M. Okafor',  s: 'inring' },
    { a: 251, n: "Highmark's Pennywhistle",        b: 'Golden Retriever',   h: 'R. Nash',    s: 'pending' },
    { a: 254, n: "Seastone's Drifting Light",      b: 'Australian Shepherd',h: 'T. Bergen',  s: 'pending' },
    { a: 258, n: "Fernridge's Quiet Thunder",      b: 'Sheltie',            h: 'E. Park',    s: 'pending' },
    { a: 262, n: "Willowbrook's Hemlock",          b: 'Border Collie',      h: 'D. Fleming', s: 'pending' },
  ];
  return (
    <div style={{ background: Q.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <QHeader
        title={cls?.name || 'Novice A — Obedience'}
        subtitle={`${cls?.ring || 'Ring 2'} · 3 of 12 scored`}
        left={<div onClick={onBack} style={{ color: Q.terra, fontSize: 22, fontWeight: 300, lineHeight: 1, cursor: 'pointer' }}>‹</div>}
        right={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={Q.terra} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/></svg>}
      />

      <div style={{ margin: '0 16px 12px', padding: '10px 14px', background: Q.liveTint, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${Q.live}22` }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: Q.live, boxShadow: `0 0 0 3px ${Q.live}33` }}/>
        <div style={{ fontSize: 13, color: Q.liveInk, fontWeight: 500, flex: 1 }}>Judge: Mrs. Patricia Holloway</div>
        <div style={{ fontSize: 11, color: Q.liveInk, fontFamily: Q.mono, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: 0.5 }}>LIVE</div>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {entries.map(e => (
          <QEntryCard
            key={e.a}
            armband={e.a} name={e.n} breed={e.b} handler={e.h} status={e.s} place={e.p}
            onClick={() => e.s !== 'done' && onOpenEntry(e)}
          />
        ))}
      </div>
      <QTabBar active="classes"/>
    </div>
  );
}

function ScreenScoreV2({ entry, onBack, onSubmit }) {
  const [score, setScore] = React.useState('195.5');
  const [quals, setQuals] = React.useState('Q');
  const [place, setPlace] = React.useState(null);

  return (
    <div style={{ background: Q.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      {/* Theatrical watermark rosette */}
      <div style={{
        position: 'absolute', top: -30, right: -50, width: 280, height: 380,
        opacity: 0.06, pointerEvents: 'none', color: Q.terra,
      }}>
        <QRosette size={280} color={Q.terra}/>
      </div>

      <QHeader
        title={`Armband ${entry?.a || 247}`}
        subtitle="Novice A · Ring 2"
        left={<div onClick={onBack} style={{ color: Q.terra, fontSize: 22, fontWeight: 300, lineHeight: 1, cursor: 'pointer' }}>‹</div>}
        right={<div style={{ color: Q.terra, fontSize: 13, fontWeight: 600 }}>Cancel</div>}
      />

      {/* LIVE status strip */}
      <div style={{ margin: '0 16px 14px', padding: '8px 12px', background: Q.live, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', boxShadow: '0 0 0 3px rgba(255,255,255,0.35)' }}/>
        <div style={{ fontSize: 12, color: '#fff', fontWeight: 600, flex: 1, letterSpacing: 0.3 }}>IN RING · 2:47 elapsed</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.85)', fontFamily: Q.mono, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>LIVE</div>
      </div>

      {/* Dog identity */}
      <div style={{ margin: '0 16px 18px', padding: 18, background: '#fff', borderRadius: 16, boxShadow: '0 1px 2px rgba(61,37,22,.04),0 4px 16px rgba(61,37,22,.04)', position: 'relative' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <QArmband n={entry?.a || 247} status="inring" size={64}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: Q.serif, fontSize: 19, fontWeight: 500, color: Q.text, letterSpacing: -0.3, lineHeight: 1.15, fontVariationSettings: '"opsz" 48, "SOFT" 50' }}>{entry?.n || "Dewfall's Song of the Moor"}</div>
            <div style={{ fontSize: 12, color: Q.sec, marginTop: 4 }}>{entry?.b || 'Border Collie'} · {entry?.h || 'M. Okafor'}</div>
          </div>
        </div>
      </div>

      {/* Score — big, serif-numeric */}
      <div style={{ padding: '0 16px 10px', fontSize: 11, color: Q.sec, letterSpacing: 0.8, fontWeight: 700, textTransform: 'uppercase', position: 'relative', zIndex: 1 }}>Total score</div>
      <div style={{
        margin: '0 16px 16px', padding: '32px 16px 26px', background: '#fff',
        borderRadius: 16, textAlign: 'center',
        boxShadow: '0 1px 2px rgba(61,37,22,.04),0 4px 16px rgba(61,37,22,.04)',
        position: 'relative', zIndex: 1,
        borderTop: `3px solid ${Q.terra}`,
      }}>
        <div style={{
          fontFamily: Q.mono, fontSize: 64, fontWeight: 700,
          color: Q.text, letterSpacing: -2.5, lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}>{score}</div>
        <div style={{ fontSize: 12, color: Q.sec, marginTop: 8, letterSpacing: 0.3 }}>out of 200.0 possible</div>
      </div>

      {/* Qualifying */}
      <div style={{ padding: '0 16px 8px', fontSize: 11, color: Q.sec, letterSpacing: 0.8, fontWeight: 700, textTransform: 'uppercase' }}>Result</div>
      <QSegmented options={['Q', 'NQ', 'ABS', 'EX']} value={quals} onChange={setQuals}/>

      {/* Placement — with rosettes */}
      <div style={{ padding: '0 16px 8px', fontSize: 11, color: Q.sec, letterSpacing: 0.8, fontWeight: 700, textTransform: 'uppercase' }}>Placement</div>
      <div style={{ display: 'flex', gap: 8, padding: '0 16px', marginBottom: 16 }}>
        {[1, 2, 3, 4, null].map((p, i) => {
          const on = place === p;
          return (
            <div key={i} onClick={() => setPlace(p)} style={{
              flex: 1, padding: '12px 0 10px', textAlign: 'center',
              background: on ? Q.terra : '#fff',
              color: on ? '#fff' : Q.text,
              border: on ? 'none' : `1px solid ${Q.border}`,
              borderRadius: 12, cursor: 'pointer',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 2,
              boxShadow: on ? '0 3px 8px rgba(201,100,66,0.35)' : 'none',
            }}>
              {p ? <QRosette size={14} color={on ? '#fff' : Q.terra}/> : <div style={{ height: 14 }}/>}
              <div style={{ fontFamily: Q.mono, fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{p || '—'}</div>
            </div>
          );
        })}
      </div>

      <div style={{ flex: 1 }}/>

      {/* Submit */}
      <div style={{ padding: '12px 16px 14px', borderTop: `0.5px solid ${Q.sep}`, background: 'rgba(255,252,246,0.88)', backdropFilter: 'blur(20px)' }}>
        <div onClick={onSubmit} style={{
          background: Q.terra, color: '#fff',
          padding: '16px', borderRadius: 14, textAlign: 'center',
          fontSize: 16, fontWeight: 600, cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(201,100,66,0.4)',
          letterSpacing: 0.2,
        }}>Submit score →</div>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenHomeV2, ScreenEntriesV2, ScreenScoreV2 });
