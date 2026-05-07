/* components.jsx — Shared UI primitives for myK9Show redesign */
/* global React, lucide */
const { useState, useEffect, useRef, useMemo } = React;

// ---------- Icon helper (Lucide inline via window.lucide, fallback SVG) ----------
function Icon({ name, size = 20, stroke = 2, className = '', style = {} }) {
  const ref = useRef(null);
  useEffect(() => {
    if (window.lucide && ref.current) {
      ref.current.innerHTML = '';
      const el = document.createElement('i');
      el.setAttribute('data-lucide', name);
      ref.current.appendChild(el);
      window.lucide.createIcons({ attrs: { width: size, height: size, 'stroke-width': stroke } });
    }
  }, [name, size, stroke]);
  return <span ref={ref} className={`icon ${className}`} style={{ display: 'inline-flex', width: size, height: size, ...style }} />;
}

// ---------- Sidebar nav ----------
const NAV_BY_ROLE = {
  exhibitor: [
    { key: 'shows', label: 'Find a show', icon: 'calendar-days', sub: 'Browse & sign up' },
    { key: 'entries', label: 'My entries', icon: 'clipboard-list', sub: 'Upcoming classes' },
    { key: 'dogs', label: 'My dogs', icon: 'dog', sub: 'Your team' },
    { key: 'results', label: 'My results', icon: 'medal', sub: 'Ribbons & scores' },
    { key: 'clubs', label: 'Clubs', icon: 'building-2', sub: 'Browse host clubs' },
  ],
  secretary: [
    { key: 'shows', label: 'My shows', icon: 'calendar-days', sub: 'Shows I run' },
    { key: 'trials', label: 'Trials & rings', icon: 'trophy', sub: 'Schedule & setup' },
    { key: 'classes', label: 'Classes', icon: 'list-checks', sub: 'All classes' },
    { key: 'entries', label: 'Entries', icon: 'clipboard-list', sub: 'All entries' },
    { key: 'dogs', label: 'Dogs', icon: 'dog', sub: 'All entered' },
    { key: 'people', label: 'People', icon: 'users', sub: 'Judges & handlers' },
    { key: 'clubs', label: 'My club', icon: 'building-2', sub: 'Members & settings' },
    { key: 'reports', label: 'Reports', icon: 'file-text', sub: 'Catalog · check-in' },
  ],
};

function Sidebar({ active = 'shows', onNav = () => {}, role = 'exhibitor' }) {
  const items = NAV_BY_ROLE[role] || NAV_BY_ROLE.exhibitor;
  const isSec = role === 'secretary';
  return (
    <aside style={sbStyles.aside}>
      <div style={sbStyles.brand}>
        <img src="assets/myk9show-logo.png" alt="" style={{ width: 36, height: 36, borderRadius: 10 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 500 }}>myK9Show</div>
          <div style={{ fontSize: 12, color: isSec ? 'var(--terracotta-600)' : 'var(--stone-500)', fontWeight: isSec ? 600 : 400 }}>
            {isSec ? 'Secretary · Sarah M.' : 'Exhibitor · Sarah M.'}
          </div>
        </div>
      </div>
      <nav style={{ padding: '8px', flex: 1 }}>
        {items.map(item => (
          <button
            key={item.key}
            onClick={() => onNav(item.key)}
            style={{
              ...sbStyles.navItem,
              ...(active === item.key ? {
                background: isSec ? 'var(--terracotta-50)' : 'var(--teal-50)',
                color: isSec ? 'var(--terracotta-700)' : 'var(--teal-700)',
              } : {}),
            }}
          >
            <Icon name={item.icon} size={22} stroke={active === item.key ? 2.2 : 1.8} />
            <div style={{ textAlign: 'left', flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: active === item.key ? 600 : 500 }}>{item.label}</div>
              <div style={{ fontSize: 12, color: active === item.key ? (isSec ? 'var(--terracotta-600)' : 'var(--teal-700)') : 'var(--stone-500)', marginTop: 1 }}>{item.sub}</div>
            </div>
          </button>
        ))}
      </nav>
      <div style={sbStyles.help}>
        <Icon name="life-buoy" size={20} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Need help?</div>
          <div style={{ fontSize: 12, color: 'var(--stone-500)' }}>Call (555) 123-K9SHOW</div>
        </div>
      </div>
    </aside>
  );
}

const sbStyles = {
  aside: {
    width: 'var(--sidebar-w)',
    background: '#fff',
    borderRight: '1px solid var(--ivory-200)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  brand: {
    padding: '20px 20px 18px',
    borderBottom: '1px solid var(--ivory-200)',
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  navItem: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '12px 14px',
    borderRadius: 12,
    border: 0,
    background: 'transparent',
    color: 'var(--foreground)',
    marginBottom: 4,
    minHeight: 56,
    transition: 'background .15s',
  },
  navItemActive: {
    background: 'var(--teal-50)',
    color: 'var(--teal-700)',
  },
  help: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    padding: '16px 20px',
    borderTop: '1px solid var(--ivory-200)',
    background: 'var(--ivory-100)',
  },
};

// ---------- Top bar (breadcrumb + search + avatar) ----------
function TopBar({ crumbs = [], onHelp }) {
  return (
    <div style={tbStyles.bar}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, flex: 1, minWidth: 0 }}>
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Icon name="chevron-right" size={16} style={{ color: 'var(--stone-500)' }} />}
            <span style={{
              color: i === crumbs.length - 1 ? 'var(--foreground)' : 'var(--stone-600)',
              fontWeight: i === crumbs.length - 1 ? 600 : 400,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {c}
            </span>
          </React.Fragment>
        ))}
      </nav>
      <div style={tbStyles.search}>
        <Icon name="search" size={20} style={{ color: 'var(--stone-500)' }} />
        <input placeholder="Search shows, dogs, people…" style={tbStyles.searchInput} />
      </div>
      <button style={tbStyles.avatar}>SM</button>
    </div>
  );
}

const tbStyles = {
  bar: {
    height: 'var(--topbar-h)',
    background: 'rgba(250,249,245,0.92)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid var(--ivory-200)',
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    padding: '0 32px',
    flexShrink: 0,
  },
  search: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: '#fff',
    border: '1px solid var(--ivory-200)',
    borderRadius: 12,
    padding: '0 14px',
    width: 320,
    height: 44,
  },
  searchInput: {
    border: 0,
    background: 'transparent',
    outline: 'none',
    flex: 1,
    fontFamily: 'inherit',
    fontSize: 15,
    color: 'var(--foreground)',
  },
  avatar: {
    width: 44, height: 44, borderRadius: 999,
    background: 'linear-gradient(135deg,#14b8a6,#0f766e)',
    color: '#fff', fontWeight: 600, fontSize: 14,
    border: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
};

// ---------- Button ----------
function Button({ variant = 'primary', size = 'md', icon, iconRight, children, onClick, full, style = {}, ariaLabel }) {
  const sizes = {
    sm: { height: 40, padding: '0 16px', fontSize: 14, radius: 10 },
    md: { height: 48, padding: '0 20px', fontSize: 16, radius: 12 },
    lg: { height: 56, padding: '0 28px', fontSize: 17, radius: 14 },
    xl: { height: 64, padding: '0 36px', fontSize: 18, radius: 16 },
  };
  const variants = {
    primary: { background: 'var(--teal-500)', color: '#fff', border: '1px solid var(--teal-500)' },
    secondary: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--ivory-200)' },
    ghost: { background: 'transparent', color: 'var(--foreground)', border: '1px solid transparent' },
    danger: { background: '#fff', color: 'var(--danger)', border: '1px solid #fecaca' },
    dark: { background: 'var(--ink-900)', color: '#fff', border: '1px solid var(--ink-900)' },
  };
  const s = sizes[size] || sizes.md;
  const v = variants[variant] || variants.primary;
  return (
    <button
      aria-label={ariaLabel}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        fontWeight: 600,
        height: s.height,
        padding: s.padding,
        fontSize: s.fontSize,
        borderRadius: s.radius,
        width: full ? '100%' : 'auto',
        transition: 'all .15s ease',
        ...v,
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={s.fontSize + 4} />}
      {children}
      {iconRight && <Icon name={iconRight} size={s.fontSize + 4} />}
    </button>
  );
}

// ---------- Chip / Badge ----------
function Chip({ variant = 'stone', children, icon, size = 'md' }) {
  const variants = {
    green: { bg: 'var(--chip-green-bg)', fg: 'var(--chip-green-fg)' },
    amber: { bg: 'var(--chip-amber-bg)', fg: 'var(--chip-amber-fg)' },
    red: { bg: 'var(--chip-red-bg)', fg: 'var(--chip-red-fg)' },
    blue: { bg: 'var(--chip-blue-bg)', fg: 'var(--chip-blue-fg)' },
    purple: { bg: 'var(--chip-purple-bg)', fg: 'var(--chip-purple-fg)' },
    teal: { bg: 'var(--chip-teal-bg)', fg: 'var(--chip-teal-fg)' },
    stone: { bg: 'var(--chip-stone-bg)', fg: 'var(--chip-stone-fg)' },
  };
  const v = variants[variant] || variants.stone;
  const sz = size === 'lg'
    ? { padding: '6px 14px', fontSize: 14 }
    : { padding: '4px 10px', fontSize: 12 };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: v.bg, color: v.fg,
      borderRadius: 999, fontWeight: 600,
      ...sz,
    }}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

// ---------- Page Shell (sidebar + topbar + content) ----------
function PageShell({ active, crumbs, children, wide = false, role = 'exhibitor' }) {
  return (
    <div style={{ display: 'flex', minHeight: '100%', background: 'var(--ivory-50)' }} data-role={role}>
      <Sidebar active={active} role={role} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar crumbs={crumbs} />
        <main style={{
          flex: 1,
          padding: '28px 40px 60px',
          maxWidth: wide ? 'none' : 'var(--content-max)',
          width: '100%',
          margin: '0 auto',
        }}>
          {children}
        </main>
      </div>
    </div>
  );
}

// ---------- Page header with big title + primary action ----------
function PageHeader({ eyebrow, title, subtitle, primary, secondary, onBack }) {
  return (
    <header style={{ marginBottom: 24 }}>
      {onBack && (
        <button onClick={onBack} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'transparent', border: '1px solid var(--ivory-200)',
          borderRadius: 10, padding: '8px 14px', marginBottom: 14,
          fontSize: 15, fontWeight: 500, color: 'var(--stone-700)',
        }}>
          <Icon name="arrow-left" size={18} />
          Back
        </button>
      )}
      {eyebrow && <div className="eyebrow" style={{ marginBottom: 8 }}>{eyebrow}</div>}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <h1 className="serif" style={{ fontSize: 'var(--display-md)', margin: 0, lineHeight: 1.1 }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 'var(--ui-lg)', color: 'var(--stone-700)', margin: '8px 0 0', maxWidth: 640 }}>{subtitle}</p>}
        </div>
        <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
          {secondary}
          {primary}
        </div>
      </div>
    </header>
  );
}

// ---------- Tabs (big, tap-friendly) ----------
function Tabs({ items, active, onChange }) {
  return (
    <div style={{
      display: 'flex', gap: 4, background: '#fff',
      borderRadius: 14, padding: 6,
      border: '1px solid var(--ivory-200)',
      marginBottom: 24,
      flexWrap: 'wrap',
    }}>
      {items.map(it => (
        <button
          key={it.key}
          onClick={() => onChange(it.key)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '12px 20px',
            borderRadius: 10,
            border: 0,
            background: active === it.key ? 'var(--teal-500)' : 'transparent',
            color: active === it.key ? '#fff' : 'var(--stone-700)',
            fontWeight: 600, fontSize: 15,
            minHeight: 48,
            transition: 'all .15s',
          }}
        >
          {it.icon && <Icon name={it.icon} size={18} />}
          {it.label}
          {it.count != null && (
            <span style={{
              background: active === it.key ? 'rgba(255,255,255,0.22)' : 'var(--ivory-100)',
              padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700,
            }}>{it.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ---------- Card ----------
function Card({ children, style = {}, onClick, hoverable = false }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        borderRadius: 16,
        border: '1px solid var(--ivory-200)',
        boxShadow: 'rgba(0,0,0,0.03) 0 2px 12px',
        overflow: 'hidden',
        transition: 'all .2s',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ---------- Cover placeholder (date-chip gradient, matches DS) ----------
function Cover({ month, day, palette = 'teal', badge, image, tall = false }) {
  const palettes = {
    teal: ['#ccfbf1', '#0d9488'],
    terracotta: ['#fef3c7', '#c96442'],
    purple: ['#e9d5ff', '#7c3aed'],
    blue: ['#dbeafe', '#2563eb'],
    pink: ['#fce7f3', '#be185d'],
    green: ['#d1fae5', '#059669'],
    amber: ['#fde68a', '#d97706'],
  };
  const [c1, c2] = palettes[palette] || palettes.teal;
  return (
    <div data-browse-cover style={{
      aspectRatio: tall ? '4 / 3' : '16 / 9',
      background: image ? `url(${image}) center/cover` : `linear-gradient(135deg, ${c1}, ${c2})`,
      position: 'relative',
    }}>
      {month && (
        <div style={{
          position: 'absolute', top: 16, left: 16,
          background: 'rgba(255,255,255,0.96)',
          borderRadius: 14, padding: '8px 12px',
          textAlign: 'center', minWidth: 52,
          fontFamily: 'var(--font-mono)',
          boxShadow: 'rgba(0,0,0,0.08) 0 2px 8px',
        }}>
          <div data-cover-month style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--stone-600)' }}>{month}</div>
          <div data-cover-day style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-900)', lineHeight: 1 }}>{day}</div>
        </div>
      )}
      {badge && (
        <div style={{
          position: 'absolute', top: 16, right: 16,
          background: 'rgba(255,255,255,0.96)',
          borderRadius: 999, padding: '6px 12px',
          fontSize: 12, fontWeight: 700, color: 'var(--teal-700)',
        }}>{badge}</div>
      )}
    </div>
  );
}

// ---------- Placeholder photo (warm gradient w/ initials) ----------
function PhotoPlaceholder({ initials, palette = 'teal', aspect = '1 / 1', rounded = 16 }) {
  const palettes = {
    teal: ['#ccfbf1', '#0d9488'],
    terracotta: ['#fef3c7', '#c96442'],
    purple: ['#e9d5ff', '#7c3aed'],
    blue: ['#dbeafe', '#2563eb'],
    pink: ['#fce7f3', '#be185d'],
    green: ['#d1fae5', '#059669'],
    amber: ['#fde68a', '#d97706'],
    stone: ['#e8e6dc', '#87867f'],
  };
  const [c1, c2] = palettes[palette] || palettes.teal;
  return (
    <div style={{
      aspectRatio: aspect,
      borderRadius: rounded,
      background: `linear-gradient(135deg, ${c1}, ${c2})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'rgba(255,255,255,0.9)',
      fontFamily: 'var(--font-serif)', fontSize: 32, fontWeight: 500,
      letterSpacing: '-0.02em',
    }}>
      {initials}
    </div>
  );
}

// ---------- Info tile (key-value stat) ----------
function InfoTile({ label, value, icon, mono, hint }) {
  return (
    <div style={{
      background: 'var(--ivory-100)',
      border: '1px solid var(--ivory-200)',
      borderRadius: 14, padding: '16px 18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, color: 'var(--stone-600)', fontSize: 13, fontWeight: 500 }}>
        {icon && <Icon name={icon} size={16} />}
        {label}
      </div>
      <div style={{
        fontSize: 22,
        fontWeight: 600,
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        color: 'var(--ink-900)',
        lineHeight: 1.2,
      }}>{value}</div>
      {hint && <div style={{ fontSize: 13, color: 'var(--stone-500)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

// ---------- Section heading ----------
function SectionTitle({ title, action, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14, gap: 20 }}>
      <div>
        <h2 className="serif" style={{ fontSize: 28, margin: 0 }}>{title}</h2>
        {sub && <div style={{ fontSize: 14, color: 'var(--stone-600)', marginTop: 4 }}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}

// Export
Object.assign(window, {
  Icon, Sidebar, TopBar, Button, Chip, PageShell, PageHeader,
  Tabs, Card, Cover, PhotoPlaceholder, InfoTile, SectionTitle,
  NAV_BY_ROLE,
});
