/* browse-templates.jsx — 3 Browse page directions */
/* global React, Card, Cover, Chip, Icon, Button, PhotoPlaceholder, SectionTitle, SHOWS */
const { useState: useStateB } = React;

// ============================================================
// TEMPLATE A — Spacious Photo-first (large cards, one clear action)
// ============================================================
function BrowseTemplateA({ items = SHOWS }) {
  return (
    <div>
      <SearchStrip variant="prominent" />
      <QuickFilters variant="big" />
      <div style={{ fontSize: 15, color: 'var(--stone-600)', margin: '18px 0 14px' }}>
        Showing <strong style={{ color: 'var(--ink-900)' }}>{items.length} shows</strong> within 60 miles · next 30 days
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
        gap: 24,
      }}>
        {items.map(s => <ShowCardPhotoFirst key={s.id} show={s} />)}
      </div>
    </div>
  );
}

function ShowCardPhotoFirst({ show }) {
  return (
    <Card hoverable>
      <Cover month={show.month} day={show.day} palette={show.palette} badge={show.badge} />
      <div style={{ padding: '20px 22px 22px' }}>
        <h3 className="serif" style={{ fontSize: 22, margin: '0 0 8px', lineHeight: 1.2 }}>{show.name}</h3>
        <div style={{ display: 'flex', gap: 14, marginBottom: 14, color: 'var(--stone-700)', fontSize: 15, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="map-pin" size={16} /> {show.city}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="users" size={16} /> <span className="mono">{show.entries}</span> entries
          </span>
        </div>
        <div style={{ fontSize: 14, color: 'var(--stone-600)', marginBottom: 18, minHeight: 22 }}>
          {show.kind}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button size="lg" full icon="pencil-line">Sign up this show</Button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--stone-500)', marginTop: 10, textAlign: 'center' }}>
          From <span className="mono" style={{ color: 'var(--ink-900)', fontWeight: 600 }}>${show.fee}</span> per entry · {show.statusText}
        </div>
      </div>
    </Card>
  );
}

// ============================================================
// TEMPLATE B — Balanced (photo + key facts row)
// ============================================================
function BrowseTemplateB({ items = SHOWS }) {
  return (
    <div>
      <SearchStrip variant="inline" />
      <QuickFilters variant="compact" />
      <div style={{ fontSize: 15, color: 'var(--stone-600)', margin: '16px 0 12px' }}>
        <strong style={{ color: 'var(--ink-900)' }}>{items.length} shows</strong> · sorted by date
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {items.map(s => <ShowRowBalanced key={s.id} show={s} />)}
      </div>
    </div>
  );
}

function ShowRowBalanced({ show }) {
  return (
    <Card>
      <div data-browse-row style={{ display: 'flex', gap: 20, padding: 18, alignItems: 'center' }}>
        <div style={{ width: 160, flexShrink: 0 }}>
          <Cover month={show.month} day={show.day} palette={show.palette} tall />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span className="eyebrow">{show.dateRange}</span>
            {show.status === 'closes-soon' && <Chip variant="amber" size="sm">Closes soon</Chip>}
            {show.status === 'open' && <Chip variant="green" size="sm">Open</Chip>}
          </div>
          <h3 className="serif" style={{ fontSize: 22, margin: '0 0 6px', lineHeight: 1.2 }}>{show.name}</h3>
          <div style={{ fontSize: 14, color: 'var(--stone-600)', marginBottom: 10 }}>{show.kind}</div>
          <div data-browse-meta style={{ display: 'flex', gap: 20, fontSize: 14, color: 'var(--stone-700)', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="map-pin" size={15}/> {show.city}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="users" size={15}/> <span className="mono">{show.entries}</span> entries</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="dollar-sign" size={15}/> from <span className="mono">${show.fee}</span></span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <Button size="lg" icon="pencil-line">Sign up</Button>
          <Button size="sm" variant="ghost" iconRight="chevron-right">View details</Button>
        </div>
      </div>
    </Card>
  );
}

// ============================================================
// TEMPLATE C — Utility table (dense, table-first)
// ============================================================
function BrowseTemplateC({ items = SHOWS }) {
  return (
    <div>
      <SearchStrip variant="inline" />
      <QuickFilters variant="compact" />
      <Card style={{ marginTop: 18 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--ivory-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, color: 'var(--stone-600)' }}>
            <strong style={{ color: 'var(--ink-900)' }}>{items.length} shows</strong>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" variant="secondary" icon="arrow-down-up">Sort by date</Button>
            <Button size="sm" variant="secondary" icon="columns-3">Columns</Button>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
          <thead>
            <tr style={{ background: 'var(--ivory-100)', textAlign: 'left', color: 'var(--stone-600)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Show</th>
              <th style={thStyle}>Location</th>
              <th style={thStyle}>Type</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Entries</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Fee</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map(s => (
              <tr key={s.id} style={{ borderTop: '1px solid var(--ivory-200)' }}>
                <td style={tdStyle}>
                  <div className="mono" style={{ fontWeight: 600, fontSize: 15 }}>{s.month} {s.day}</div>
                  <div style={{ fontSize: 12, color: 'var(--stone-500)' }}>{s.dateRange.split('·')[1]?.trim()}</div>
                </td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{s.name}</td>
                <td style={tdStyle}>{s.city}</td>
                <td style={{ ...tdStyle, color: 'var(--stone-600)' }}>{s.kind}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{s.entries}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>${s.fee}</td>
                <td style={tdStyle}>
                  {s.status === 'closes-soon' ? <Chip variant="amber" size="sm">Closes Fri</Chip> : <Chip variant="green" size="sm">Open</Chip>}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <Button size="sm" icon="pencil-line">Sign up</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
const thStyle = { padding: '14px 18px', fontWeight: 600 };
const tdStyle = { padding: '16px 18px', verticalAlign: 'middle' };

// ============================================================
// Shared search + filters
// ============================================================
function SearchStrip({ variant = 'prominent' }) {
  if (variant === 'prominent') {
    return (
      <div style={{
        background: '#fff', borderRadius: 16, border: '1px solid var(--ivory-200)',
        padding: 8, display: 'flex', alignItems: 'center', gap: 4,
        boxShadow: 'rgba(0,0,0,0.04) 0 4px 20px', marginBottom: 18,
      }}>
        <div style={strippedFieldStyle}>
          <Icon name="search" size={20} style={{ color: 'var(--stone-500)' }} />
          <input placeholder="Show name or breed" style={fieldInputStyle} />
        </div>
        <div style={{ width: 1, height: 36, background: 'var(--ivory-200)' }} />
        <div style={strippedFieldStyle}>
          <Icon name="map-pin" size={20} style={{ color: 'var(--stone-500)' }} />
          <input placeholder="Location" defaultValue="New Jersey" style={fieldInputStyle} />
        </div>
        <div style={{ width: 1, height: 36, background: 'var(--ivory-200)' }} />
        <div style={strippedFieldStyle}>
          <Icon name="calendar" size={20} style={{ color: 'var(--stone-500)' }} />
          <input placeholder="Any date" defaultValue="Apr — Jun 2026" style={fieldInputStyle} />
        </div>
        <Button size="lg" icon="search">Search</Button>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
      <div style={{
        flex: 1,
        display: 'flex', alignItems: 'center', gap: 10,
        background: '#fff', border: '1px solid var(--ivory-200)',
        borderRadius: 12, padding: '0 16px', height: 52,
      }}>
        <Icon name="search" size={20} style={{ color: 'var(--stone-500)' }} />
        <input placeholder="Search shows, clubs, or breeds…" style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, fontFamily: 'inherit', fontSize: 16 }} />
      </div>
      <Button size="lg" variant="secondary" icon="sliders-horizontal">Filters</Button>
    </div>
  );
}
const strippedFieldStyle = { flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', minWidth: 0 };
const fieldInputStyle = { border: 0, background: 'transparent', outline: 'none', flex: 1, fontFamily: 'inherit', fontSize: 15, minWidth: 0 };

function QuickFilters({ variant = 'big' }) {
  const filters = ['All events', 'Conformation', 'Obedience', 'Rally', 'Agility', 'Scent work', 'Open entries'];
  const [active, setA] = useStateB(0);
  const sz = variant === 'big'
    ? { padding: '10px 18px', fontSize: 15, minHeight: 44 }
    : { padding: '8px 14px', fontSize: 14, minHeight: 38 };
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {filters.map((f, i) => (
        <button key={f}
          onClick={() => setA(i)}
          style={{
            ...sz,
            borderRadius: 999,
            border: i === active ? '1px solid var(--teal-500)' : '1px solid var(--ivory-200)',
            background: i === active ? 'var(--teal-50)' : '#fff',
            color: i === active ? 'var(--teal-700)' : 'var(--stone-700)',
            fontWeight: i === active ? 600 : 500,
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
          {i === active && <Icon name="check" size={14} />}
          {f}
        </button>
      ))}
    </div>
  );
}

Object.assign(window, { BrowseTemplateA, BrowseTemplateB, BrowseTemplateC, SearchStrip, QuickFilters });
