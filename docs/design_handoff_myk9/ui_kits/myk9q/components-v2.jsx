// myK9Q v2 — terracotta-led, with rosette motif
const Q = {
  bg: '#f3efe6',          // warm ivory (iOS secondary ≈ swapped for warm tone)
  card: '#ffffff',
  border: 'rgba(64,58,49,0.12)',
  sep:  'rgba(64,58,49,0.10)',
  text: '#181411',
  sec:  '#8c8376',
  ter:  'rgba(64,58,49,0.45)',

  // PRIMARY = terracotta
  terra: '#c96442',
  terraDark: '#b05338',
  terraTint: '#fdf5ef',
  terraInk: '#7c4a2e',
  terraBorder: '#f2c8a8',

  // LIVE = ring-green (only for "judging in progress")
  live: '#4e7c53',
  liveTint: '#f1f8f1',
  liveInk: '#385a3b',

  amber: '#c88b1a',
  green: '#4e7c53',
  red:  '#b04835',

  sans: '-apple-system, "SF Pro Display", system-ui, sans-serif',
  serif: "'Fraunces', Georgia, serif",
  mono: "'JetBrains Mono','SF Mono',Consolas,monospace",
};

// ─── Rosette motif ───────────────────────────────────────
function QRosette({ size = 20, color = Q.terra, style = {} }) {
  return (
    <svg width={size} height={size * 1.33} viewBox="0 0 120 160" style={style} fill={color}>
      <path d="M48 78 L38 150 L52 140 L60 152 L68 140 L82 150 L72 78 Z" opacity="0.88"/>
      <path d="M38 150 L52 140 L46 132 Z" opacity="0.55"/>
      <path d="M82 150 L68 140 L74 132 Z" opacity="0.55"/>
      <g transform="translate(60 60)">
        <circle r="42" opacity="0.22"/>
        <g opacity="0.55">
          <circle cx="0" cy="-40" r="5"/><circle cx="15.3" cy="-37" r="5"/>
          <circle cx="28.3" cy="-28.3" r="5"/><circle cx="37" cy="-15.3" r="5"/>
          <circle cx="40" cy="0" r="5"/><circle cx="37" cy="15.3" r="5"/>
          <circle cx="28.3" cy="28.3" r="5"/><circle cx="15.3" cy="37" r="5"/>
          <circle cx="0" cy="40" r="5"/><circle cx="-15.3" cy="37" r="5"/>
          <circle cx="-28.3" cy="28.3" r="5"/><circle cx="-37" cy="15.3" r="5"/>
          <circle cx="-40" cy="0" r="5"/><circle cx="-37" cy="-15.3" r="5"/>
          <circle cx="-28.3" cy="-28.3" r="5"/><circle cx="-15.3" cy="-37" r="5"/>
        </g>
        <circle r="26"/>
        <circle r="26" fill="none" stroke="#faf7f2" strokeWidth="1.5" opacity="0.9"/>
        <circle r="19" fill="none" stroke="#faf7f2" strokeWidth="0.8" opacity="0.5"/>
      </g>
    </svg>
  );
}

// ─── Primitives ──────────────────────────────────────────
function QCard({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: Q.card, borderRadius: 16,
      boxShadow: '0 1px 2px rgba(61,37,22,0.04), 0 4px 16px rgba(61,37,22,0.04)',
      ...style,
    }}>{children}</div>
  );
}

function QBadge({ children, tone = 'terra', style = {} }) {
  const tones = {
    terra:  [Q.terraTint, Q.terraInk],
    live:   [Q.liveTint, Q.liveInk],
    amber:  ['#fdf6e3', '#8a5d10'],
    green:  [Q.liveTint, Q.liveInk],
    red:    ['#fcebe6', '#7e2d1f'],
    gray:   ['#f3efe6', '#403a31'],
  };
  const [bg, fg] = tones[tone] || tones.terra;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: bg, color: fg,
      fontSize: 11, fontWeight: 600, letterSpacing: 0.2,
      padding: '3px 9px', borderRadius: 9999,
      ...style,
    }}>{children}</span>
  );
}

function QArmband({ n, status = 'pending', size = 52 }) {
  const map = {
    pending: { bg: '#fff',        border: Q.border, text: Q.text, strike: false },
    inring:  { bg: Q.terra,       border: Q.terra,  text: '#fff', strike: false },
    done:    { bg: '#f3efe6',     border: Q.border, text: Q.sec,  strike: true  },
  };
  const c = map[status];
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 4,
      background: c.bg, border: `1.5px solid ${c.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: Q.mono, fontWeight: 700, fontSize: size * 0.36,
      color: c.text, fontVariantNumeric: 'tabular-nums',
      textDecoration: c.strike ? 'line-through' : 'none',
      flexShrink: 0,
    }}>{n}</div>
  );
}

// ─── Header ──────────────────────────────────────────────
function QHeader({ title, subtitle, left, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '58px 16px 12px', gap: 12,
    }}>
      <div style={{ width: 32 }}>{left}</div>
      <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 17, fontWeight: 600, color: Q.text,
          letterSpacing: -0.3, lineHeight: 1.15,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 11, color: Q.sec, marginTop: 2, fontWeight: 500 }}>
            {subtitle}
          </div>
        )}
      </div>
      <div style={{ width: 32, textAlign: 'right' }}>{right}</div>
    </div>
  );
}

// ─── Tab Bar ─────────────────────────────────────────────
function QTabBar({ active = 'home', onChange = () => {} }) {
  const tabs = [
    { id: 'home',     label: 'Home',     d: 'M3 9l9-7 9 7v11a2 2 0 01-2 2h-4v-8h-6v8H5a2 2 0 01-2-2V9z' },
    { id: 'classes',  label: 'Classes',  d: 'M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm4 3h10M7 12h10M7 16h7' },
    { id: 'results',  label: 'Results',  d: 'M8 21h8M12 17v4M6 3h12l-1 9a5 5 0 01-10 0L6 3zM4 5h2M18 5h2' },
    { id: 'settings', label: 'Settings', d: 'M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.5 7.5 0 00-.1-1.3l2-1.6-2-3.4-2.4.9a7.5 7.5 0 00-2.3-1.3l-.4-2.5h-4l-.4 2.5a7.5 7.5 0 00-2.3 1.3l-2.4-.9-2 3.4 2 1.6a7.5 7.5 0 000 2.6l-2 1.6 2 3.4 2.4-.9a7.5 7.5 0 002.3 1.3l.4 2.5h4l.4-2.5a7.5 7.5 0 002.3-1.3l2.4.9 2-3.4-2-1.6c0-.4.1-.9.1-1.3z' },
  ];
  return (
    <div style={{
      display: 'flex', borderTop: `0.5px solid ${Q.sep}`,
      background: 'rgba(255,252,246,0.88)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      padding: '8px 0 6px',
    }}>
      {tabs.map(t => {
        const on = t.id === active;
        return (
          <div key={t.id} onClick={() => onChange(t.id)} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 2, cursor: 'pointer',
            color: on ? Q.terra : Q.sec,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth={on ? 2.2 : 1.8}
                 strokeLinecap="round" strokeLinejoin="round">
              <path d={t.d}/>
            </svg>
            <div style={{ fontSize: 10, fontWeight: on ? 600 : 500 }}>{t.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Segmented ───────────────────────────────────────────
function QSegmented({ options, value, onChange }) {
  return (
    <div style={{
      display: 'flex', background: 'rgba(64,58,49,0.10)',
      borderRadius: 9, padding: 2, margin: '0 16px 12px',
    }}>
      {options.map(o => {
        const on = o === value;
        return (
          <div key={o} onClick={() => onChange(o)} style={{
            flex: 1, textAlign: 'center', padding: '6px 10px',
            fontSize: 13, fontWeight: on ? 600 : 500,
            color: Q.text, cursor: 'pointer',
            background: on ? '#fff' : 'transparent',
            borderRadius: 7,
            boxShadow: on ? '0 3px 8px rgba(61,37,22,0.10)' : 'none',
            transition: 'all 0.15s',
          }}>{o}</div>
        );
      })}
    </div>
  );
}

// ─── Entry Card ──────────────────────────────────────────
function QEntryCard({ armband, name, breed, handler, status, place, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: Q.card, borderRadius: 14, padding: 12,
      cursor: 'pointer',
      boxShadow: '0 1px 2px rgba(61,37,22,0.03), 0 2px 8px rgba(61,37,22,0.03)',
      border: status === 'inring' ? `1.5px solid ${Q.terra}` : '1px solid transparent',
    }}>
      <QArmband n={armband} status={status}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 600, color: Q.text,
          letterSpacing: -0.2, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          textDecoration: status === 'done' ? 'line-through' : 'none',
          opacity: status === 'done' ? 0.55 : 1,
        }}>{name}</div>
        <div style={{
          fontSize: 12, color: Q.sec, marginTop: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{breed} · {handler}</div>
      </div>
      {status === 'pending' && (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={Q.ter}
             strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      )}
      {status === 'inring' && <QBadge tone="live">● IN RING</QBadge>}
      {status === 'done' && place && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <QRosette size={18} color={Q.terra}/>
          <span style={{ fontFamily: Q.mono, fontWeight: 700, fontSize: 13, color: Q.terraInk, fontVariantNumeric: 'tabular-nums' }}>{place}</span>
        </div>
      )}
      {status === 'done' && !place && (
        <div style={{ color: Q.green, fontSize: 16 }}>✓</div>
      )}
    </div>
  );
}

Object.assign(window, {
  Q, QCard, QBadge, QArmband, QRosette, QHeader, QTabBar, QSegmented, QEntryCard,
});
