/* secretary.jsx — Secretary-specific screens & context-scoping UI */
/* global React, SHOWS, TRIALS, CLASSES, Icon, Sidebar, TopBar, Button, Chip, Card, Cover, PhotoPlaceholder, InfoTile, SectionTitle, PageHeader, Tabs */
const { useState: sUseState, useRef: sUseRef, useEffect: sUseEffect } = React;

// ============================================================
//  The core idea:
//  1. Secretary has many shows. She's ALWAYS in one of two modes:
//     - "Across mode" (My Shows page): looking at her portfolio.
//     - "In-show mode": working INSIDE one show. A sticky bar tells
//       her which show, all page contents are scoped to it.
//  2. Triple-redundancy: show name appears in context bar,
//     breadcrumbs, AND sidebar label while in-show.
// ============================================================

// ----- Mock dataset: secretary is running 3 shows right now -----
const MY_SHOWS = [
  { // "Happening now" — she's at this show today
    id: 's2',
    name: 'Lehigh Valley Spring Classic',
    club: 'Lehigh Valley KC',
    city: 'Allentown, PA',
    venue: 'AG Hall',
    dateRange: 'Apr 26–28 · Sat–Mon',
    month: 'Apr', day: '26',
    palette: 'teal',
    phase: 'live', // live | upcoming | draft | past
    entries: 486, trials: 3, classes: 24, judges: 9,
    liveStats: { checkedIn: 312, absent: 18, expected: 486 },
    needsAttention: [
      { kind: 'urgent', text: '3 judge-assignment conflicts in Ring 2' },
      { kind: 'info', text: '18 entries haven\'t checked in yet' },
    ],
  },
  { // "Upcoming" — entries open, she's been setting it up
    id: 's5',
    name: 'Golden Retriever Club · Specialty',
    club: 'Golden Retriever Club of Central NJ',
    city: 'Flemington, NJ',
    venue: 'County Fairgrounds',
    dateRange: 'May 17 · Sun',
    month: 'May', day: '17',
    palette: 'pink',
    phase: 'upcoming',
    entries: 142, trials: 2, classes: 14, judges: 3,
    daysUntil: 21,
    closesIn: 14,
    needsAttention: [
      { kind: 'urgent', text: 'Entries close in 14 days · 4 classes under-filled' },
    ],
  },
  { // "Draft" — not published yet
    id: 's9',
    name: 'Fall Foliage Obedience Trial',
    club: 'Lehigh Valley KC',
    city: 'Allentown, PA',
    venue: 'TBD',
    dateRange: 'Oct 12 · Sun',
    month: 'Oct', day: '12',
    palette: 'amber',
    phase: 'draft',
    entries: 0, trials: 1, classes: 0, judges: 0,
    completion: 40, // % of setup complete
    needsAttention: [
      { kind: 'info', text: 'Venue not confirmed · Judge panel incomplete' },
    ],
  },
  { // Past
    id: 's0',
    name: 'Bergen County Winter Classic',
    club: 'Bergen County KC',
    city: 'Ramsey, NJ',
    venue: 'Eisenhower Park',
    dateRange: 'Mar 15 · Sat',
    month: 'Mar', day: '15',
    palette: 'purple',
    phase: 'past',
    entries: 368, trials: 2, classes: 18, judges: 6,
  },
];

// ============================================================
//  ShowContextBar — sticky bar above breadcrumbs when in-show
// ============================================================
function ShowContextBar({ show, onSwitch, compact = false }) {
  const [open, setOpen] = sUseState(false);
  const otherShows = MY_SHOWS.filter(s => s.id !== show.id && s.phase !== 'past');
  return (
    <div style={{
      position: 'relative',
      background: 'linear-gradient(to right, var(--terracotta-50), #fff 50%)',
      borderBottom: '1px solid var(--ivory-200)',
      borderLeft: '4px solid var(--terracotta-500)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: compact ? '10px 28px' : '14px 32px',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'var(--terracotta-500)', color: '#fff',
          borderRadius: 999, padding: '4px 12px 4px 10px',
          fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: 999, background: '#fff',
            boxShadow: '0 0 0 3px rgba(255,255,255,0.35)',
          }} />
          In show
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 500, color: 'var(--ink-900)', lineHeight: 1.1 }}>
            {show.name}
          </div>
          <div style={{ fontSize: 13, color: 'var(--stone-600)', marginTop: 2, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>{show.dateRange}</span>
            <span style={{ color: 'var(--ivory-200)' }}>·</span>
            <span>{show.entries} entries</span>
            {show.phase === 'live' && (<>
              <span style={{ color: 'var(--ivory-200)' }}>·</span>
              <span style={{ color: 'var(--terracotta-700)', fontWeight: 600 }}>● Live today</span>
            </>)}
            {show.phase === 'upcoming' && show.closesIn != null && (<>
              <span style={{ color: 'var(--ivory-200)' }}>·</span>
              <span style={{ color: 'var(--amber-700, #b45309)', fontWeight: 600 }}>Entries close in {show.closesIn} days</span>
            </>)}
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setOpen(v => !v)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: '#fff', border: '1px solid var(--ivory-200)',
            borderRadius: 10, padding: '8px 14px',
            fontSize: 14, fontWeight: 600, color: 'var(--foreground)',
            minHeight: 40,
          }}>
            <Icon name="arrow-left-right" size={16} />
            Switch show
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} />
          </button>
          {open && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              width: 420,
              background: '#fff',
              border: '1px solid var(--ivory-200)',
              borderRadius: 14,
              boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
              zIndex: 50,
              overflow: 'hidden',
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--ivory-200)', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--stone-600)' }}>
                Switch to another of your shows
              </div>
              {otherShows.map(s => (
                <button key={s.id} onClick={() => { setOpen(false); onSwitch && onSwitch(s); }} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px', border: 0, background: 'transparent',
                  textAlign: 'left', borderBottom: '1px solid var(--ivory-100)',
                  cursor: 'pointer',
                }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
                    <Cover month={s.month} day={s.day} palette={s.palette} tall />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)' }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--stone-600)', marginTop: 2 }}>
                      {s.dateRange} · {s.entries} entries
                    </div>
                  </div>
                  <PhaseBadge phase={s.phase} small />
                </button>
              ))}
              <button style={{
                width: '100%', padding: '12px 16px', border: 0, background: 'var(--ivory-100)',
                display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center',
                fontSize: 14, fontWeight: 600, color: 'var(--terracotta-700)',
                cursor: 'pointer',
              }}>
                <Icon name="layout-grid" size={16} />
                Back to My shows
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ----- Phase badge for secretary shows -----
function PhaseBadge({ phase, small = false }) {
  const map = {
    live: { label: 'Live today', variant: 'red' },
    upcoming: { label: 'Entries open', variant: 'green' },
    draft: { label: 'Draft', variant: 'amber' },
    past: { label: 'Done', variant: 'stone' },
  };
  const m = map[phase] || map.draft;
  return <Chip variant={m.variant} size={small ? 'md' : 'lg'}>{m.label}</Chip>;
}

// ============================================================
//  SecretaryPageShell — sidebar + topbar + CONTEXT BAR + content
//  Use this instead of PageShell when secretary is in-show.
// ============================================================
function SecretaryPageShell({ activeShow, sidebarActive = 'shows', crumbs, children, showLabelInNav }) {
  // Dynamically label sidebar items with the show name while in-show
  const navOverride = activeShow ? [
    { key: 'overview', label: 'Show overview', icon: 'layout-dashboard', sub: activeShow.name.slice(0, 24) },
    { key: 'trials', label: `Trials`, icon: 'trophy', sub: `${activeShow.trials} in this show` },
    { key: 'classes', label: `Classes`, icon: 'list-checks', sub: `${activeShow.classes} in this show` },
    { key: 'entries', label: `Entries`, icon: 'clipboard-list', sub: `${activeShow.entries} in this show` },
    { key: 'schedule', label: `Schedule`, icon: 'calendar', sub: 'Rings & judges' },
    { key: 'judges', label: `Judges`, icon: 'users', sub: `${activeShow.judges} assigned` },
    { key: 'reports', label: `Reports`, icon: 'file-text', sub: 'Catalog · check-in' },
    { key: 'setup', label: `Setup`, icon: 'settings', sub: 'Show details' },
  ] : null;

  return (
    <div style={{ display: 'flex', minHeight: '100%', background: 'var(--ivory-50)' }} data-role="secretary">
      <InShowSidebar active={sidebarActive} nav={navOverride} activeShow={activeShow} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar crumbs={crumbs} />
        {activeShow && <ShowContextBar show={activeShow} />}
        <main style={{ flex: 1, padding: '28px 40px 60px' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

// In-show sidebar variant (shows the show name at top, then show-scoped nav)
function InShowSidebar({ active, nav, activeShow }) {
  return (
    <aside style={{
      width: 'var(--sidebar-w)', background: '#fff',
      borderRight: '1px solid var(--ivory-200)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      <div style={{ padding: '20px 20px 18px', borderBottom: '1px solid var(--ivory-200)', display: 'flex', gap: 12, alignItems: 'center' }}>
        <img src="assets/myk9show-logo.png" alt="" style={{ width: 36, height: 36, borderRadius: 10 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 500 }}>myK9Show</div>
          <div style={{ fontSize: 12, color: 'var(--terracotta-600)', fontWeight: 600 }}>Secretary · Sarah M.</div>
        </div>
      </div>

      {/* Show-context chip AT TOP of sidebar — matches the bar above */}
      {activeShow && (
        <div style={{
          margin: '12px 12px 4px',
          padding: '10px 12px',
          borderRadius: 10,
          background: 'var(--terracotta-50)',
          border: '1px solid var(--terracotta-200, #fcd6ba)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
            <Cover month={activeShow.month} day={activeShow.day} palette={activeShow.palette} tall />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--terracotta-700)' }}>In show</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeShow.name}</div>
          </div>
        </div>
      )}

      <nav style={{ padding: '8px', flex: 1 }}>
        {(nav || []).map(item => (
          <button key={item.key} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 14,
            padding: '12px 14px', borderRadius: 12, border: 0,
            background: active === item.key ? 'var(--terracotta-50)' : 'transparent',
            color: active === item.key ? 'var(--terracotta-700)' : 'var(--foreground)',
            marginBottom: 4, minHeight: 56, cursor: 'pointer',
          }}>
            <Icon name={item.icon} size={22} stroke={active === item.key ? 2.2 : 1.8} />
            <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: active === item.key ? 600 : 500 }}>{item.label}</div>
              <div style={{
                fontSize: 12, marginTop: 1,
                color: active === item.key ? 'var(--terracotta-600)' : 'var(--stone-500)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{item.sub}</div>
            </div>
          </button>
        ))}
      </nav>

      {/* "Leave show" exit */}
      <div style={{ padding: 12, borderTop: '1px solid var(--ivory-200)' }}>
        <button style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', borderRadius: 10, border: '1px solid var(--ivory-200)',
          background: '#fff', fontSize: 14, fontWeight: 500, color: 'var(--stone-700)',
          cursor: 'pointer',
        }}>
          <Icon name="arrow-left" size={16} />
          Back to all my shows
        </button>
      </div>
    </aside>
  );
}

// ============================================================
//  My Shows page — secretary's home
// ============================================================
function SecretaryMyShows() {
  const live = MY_SHOWS.filter(s => s.phase === 'live');
  const upcoming = MY_SHOWS.filter(s => s.phase === 'upcoming');
  const draft = MY_SHOWS.filter(s => s.phase === 'draft');
  const past = MY_SHOWS.filter(s => s.phase === 'past');

  const allAttention = MY_SHOWS.flatMap(s => (s.needsAttention || []).map(a => ({ ...a, show: s })));

  return (
    <div style={{ display: 'flex', minHeight: '100%', background: 'var(--ivory-50)' }} data-role="secretary">
      <Sidebar active="shows" role="secretary" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar crumbs={['My shows']} />
        <main style={{ flex: 1, padding: '28px 40px 60px', maxWidth: 'var(--content-max)', width: '100%', margin: '0 auto' }}>
          <PageHeader
            eyebrow={`You're running ${MY_SHOWS.filter(s => s.phase !== 'past').length} shows`}
            title="My shows"
            subtitle="Everything you host. Tap a show to go in and manage entries, judges, schedule, and reports."
            primary={<Button size="xl" icon="plus" style={{ background: 'var(--terracotta-500)', borderColor: 'var(--terracotta-500)', color: '#fff' }}>Create new show</Button>}
          />

          {/* Attention strip — replaces the old dashboard */}
          {allAttention.length > 0 && (
            <AttentionStrip items={allAttention} />
          )}

          {/* Live section */}
          {live.length > 0 && (
            <PhaseSection
              kind="live"
              title="Happening today"
              sub="You're at these shows right now. Tap to go in and manage check-in, rings, and results."
              shows={live}
            />
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <PhaseSection
              kind="upcoming"
              title="Upcoming · entries open"
              sub="Published shows accepting entries. Tap to manage entries, judges, and schedule."
              shows={upcoming}
            />
          )}

          {/* Draft */}
          {draft.length > 0 && (
            <PhaseSection
              kind="draft"
              title="Draft — not yet published"
              sub="Still setting up. Shows in draft don't appear to exhibitors until you publish."
              shows={draft}
            />
          )}

          {/* Past (collapsed) */}
          {past.length > 0 && (
            <PastShowsSection shows={past} />
          )}
        </main>
      </div>
    </div>
  );
}

// ----- Attention strip (replaces separate dashboard) -----
function AttentionStrip({ items }) {
  const urgent = items.filter(i => i.kind === 'urgent');
  const info = items.filter(i => i.kind === 'info');
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--ivory-200)',
      borderRadius: 16, padding: '20px 24px', marginBottom: 32,
      borderLeft: '4px solid var(--terracotta-500)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Icon name="bell-ring" size={22} style={{ color: 'var(--terracotta-600)' }} />
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 500 }}>Needs your attention</div>
        <Chip variant="red" size="md">{urgent.length} urgent</Chip>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {urgent.concat(info).slice(0, 5).map((a, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 16px', borderRadius: 12,
            background: a.kind === 'urgent' ? 'var(--chip-red-bg)' : 'var(--ivory-100)',
          }}>
            <Icon name={a.kind === 'urgent' ? 'alert-circle' : 'info'} size={20} style={{ color: a.kind === 'urgent' ? 'var(--chip-red-fg)' : 'var(--stone-600)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-900)' }}>{a.text}</div>
              <div style={{ fontSize: 13, color: 'var(--stone-600)', marginTop: 2 }}>In {a.show.name}</div>
            </div>
            <Button size="sm" variant="secondary" iconRight="arrow-right">Go to show</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----- Phase section (holds cards using Template B pattern) -----
function PhaseSection({ kind, title, sub, shows }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <PhaseDot kind={kind} />
        <div style={{ flex: 1 }}>
          <h2 className="serif" style={{ fontSize: 28, margin: 0 }}>{title}</h2>
          <div style={{ fontSize: 14, color: 'var(--stone-600)', marginTop: 4 }}>{sub}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 14 }}>
        {shows.map(s => <MyShowRowCard key={s.id} show={s} />)}
      </div>
    </section>
  );
}

function PhaseDot({ kind }) {
  const colors = {
    live: 'var(--terracotta-500)',
    upcoming: '#059669',
    draft: '#d97706',
    past: 'var(--stone-500)',
  };
  const pulse = kind === 'live';
  return (
    <span style={{
      width: 14, height: 14, borderRadius: 999,
      background: colors[kind] || colors.draft,
      boxShadow: pulse ? `0 0 0 4px ${colors.live}22` : 'none',
      flexShrink: 0,
    }} />
  );
}

// ----- Row card — uses Template B (balanced row-cards) pattern -----
function MyShowRowCard({ show }) {
  const isLive = show.phase === 'live';
  const isDraft = show.phase === 'draft';
  return (
    <Card style={{ padding: 0, display: 'grid', gridTemplateColumns: '220px 1fr auto', gap: 0 }}>
      {/* Cover */}
      <div style={{ position: 'relative' }}>
        <Cover month={show.month} day={show.day} palette={show.palette} />
        <div style={{ position: 'absolute', bottom: 12, left: 12 }}>
          <PhaseBadge phase={show.phase} />
        </div>
      </div>

      {/* Middle content */}
      <div style={{ padding: '20px 24px', minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--stone-600)', fontWeight: 500, marginBottom: 4 }}>
          {show.dateRange} · {show.venue}, {show.city}
        </div>
        <h3 className="serif" style={{ fontSize: 26, margin: 0, marginBottom: 10, lineHeight: 1.15 }}>{show.name}</h3>

        {/* Stats row differs by phase */}
        {isLive && (
          <LiveStats show={show} />
        )}
        {show.phase === 'upcoming' && (
          <UpcomingStats show={show} />
        )}
        {isDraft && (
          <DraftProgress show={show} />
        )}

        {show.needsAttention && show.needsAttention.length > 0 && !isDraft && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {show.needsAttention.map((a, i) => (
              <div key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 8,
                background: a.kind === 'urgent' ? 'var(--chip-red-bg)' : 'var(--ivory-100)',
                color: a.kind === 'urgent' ? 'var(--chip-red-fg)' : 'var(--stone-700)',
                fontSize: 13, fontWeight: 500,
              }}>
                <Icon name={a.kind === 'urgent' ? 'alert-circle' : 'info'} size={14} />
                {a.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right action column */}
      <div style={{
        padding: '20px 24px', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'stretch', gap: 10,
        borderLeft: '1px solid var(--ivory-200)', background: 'var(--ivory-50)',
        minWidth: 220,
      }}>
        <Button
          size="lg"
          icon={isLive ? 'play-circle' : isDraft ? 'pencil-line' : 'settings'}
          style={{ background: 'var(--terracotta-500)', borderColor: 'var(--terracotta-500)', color: '#fff', width: '100%' }}
        >
          {isLive ? 'Go to show' : isDraft ? 'Continue setup' : 'Manage'}
        </Button>
        <Button size="md" variant="secondary" icon={isDraft ? 'eye' : 'file-text'} style={{ width: '100%' }}>
          {isDraft ? 'Preview' : 'Premium list'}
        </Button>
      </div>
    </Card>
  );
}

function LiveStats({ show }) {
  const { checkedIn, absent, expected } = show.liveStats;
  const pct = Math.round((checkedIn / expected) * 100);
  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
      <InlineStat label="Checked in" value={`${checkedIn}/${expected}`} tint="green" />
      <InlineStat label="Progress" value={`${pct}%`} bar={pct} tint="teal" />
      <InlineStat label="Absent" value={absent} tint="red" />
      <InlineStat label="Rings active" value={`${show.trials} · ${show.classes} classes`} tint="stone" />
    </div>
  );
}

function UpcomingStats({ show }) {
  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
      <InlineStat label="Entries in" value={show.entries} tint="teal" />
      <InlineStat label="Trials" value={show.trials} tint="stone" />
      <InlineStat label="Classes" value={show.classes} tint="stone" />
      <InlineStat label="Judges" value={show.judges} tint="stone" />
      <InlineStat label="Days to show" value={show.daysUntil} tint="amber" />
    </div>
  );
}

function DraftProgress({ show }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--stone-700)' }}>Setup progress</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-900)' }}>{show.completion}%</div>
      </div>
      <div style={{ height: 10, background: 'var(--ivory-200)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${show.completion}%`, height: '100%', background: 'linear-gradient(to right, #fbbf24, #d97706)', borderRadius: 999 }} />
      </div>
      <div style={{ fontSize: 13, color: 'var(--stone-600)', marginTop: 8 }}>
        Venue not confirmed · Judge panel incomplete · Classes not yet defined
      </div>
    </div>
  );
}

function InlineStat({ label, value, tint = 'stone', bar }) {
  const tints = {
    green: 'var(--chip-green-fg)',
    teal: 'var(--teal-700)',
    red: 'var(--chip-red-fg)',
    amber: '#b45309',
    stone: 'var(--stone-700)',
  };
  return (
    <div style={{ minWidth: 90 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--stone-500)', fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: tints[tint] || tints.stone, fontFamily: 'var(--font-mono)' }}>{value}</div>
      {bar != null && (
        <div style={{ height: 4, background: 'var(--ivory-200)', borderRadius: 999, marginTop: 4, width: 80 }}>
          <div style={{ height: '100%', width: `${bar}%`, background: tints[tint] || tints.stone, borderRadius: 999 }} />
        </div>
      )}
    </div>
  );
}

function PastShowsSection({ shows }) {
  const [open, setOpen] = sUseState(false);
  return (
    <section>
      <button onClick={() => setOpen(v => !v)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 18px', background: '#fff',
        border: '1px solid var(--ivory-200)', borderRadius: 12,
        cursor: 'pointer', textAlign: 'left',
      }}>
        <PhaseDot kind="past" />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 500 }}>Past shows</div>
          <div style={{ fontSize: 13, color: 'var(--stone-600)' }}>{shows.length} finished · results and catalogs archived</div>
        </div>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} />
      </button>
      {open && (
        <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
          {shows.map(s => <MyShowRowCard key={s.id} show={s} />)}
        </div>
      )}
    </section>
  );
}

// ============================================================
//  In-show pages — show the context bar above page content
// ============================================================

// Secretary — in-show Entries page
function SecretaryEntriesPage() {
  const show = MY_SHOWS[0]; // Lehigh Valley, live
  return (
    <SecretaryPageShell
      activeShow={show}
      sidebarActive="entries"
      crumbs={['My shows', show.name, 'Entries']}
    >
      <PageHeader
        eyebrow={`All entries for ${show.name}`}
        title="Entries"
        subtitle="All 486 entries across all trials in this show. Use filters to narrow down by trial, class, or status."
        primary={<Button size="xl" icon="download" style={{ background: 'var(--terracotta-500)', borderColor: 'var(--terracotta-500)', color: '#fff' }}>Export catalog</Button>}
        secondary={<Button size="xl" variant="secondary" icon="plus">Add entry</Button>}
      />

      {/* Filter bar — trial filter is context-scoped to this show */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <FilterChip label="All trials" count={486} active />
        <FilterChip label="Saturday All-Breed" count={210} />
        <FilterChip label="Sunday All-Breed" count={188} />
        <FilterChip label="Obedience" count={88} />
        <div style={{ flex: 1 }} />
        <FilterChip label="Checked in" count={312} />
        <FilterChip label="Absent" count={18} tint="red" />
      </div>

      {/* Entries list */}
      <div style={{ background: '#fff', border: '1px solid var(--ivory-200)', borderRadius: 16, overflow: 'hidden' }}>
        <EntryRow dog="Maggie" regName="Sunridge Magnolia Of Birchbrook" breed="Golden Retriever" trial="Saturday All-Breed" cls="Open Bitch" ring="Ring 3" time="9:40 AM" status="checked-in" owner="Sarah Martin" />
        <EntryRow dog="Finn" regName="Blackwater Northern Light" breed="Labrador Retriever" trial="Saturday All-Breed" cls="Best of Breed" ring="Ring 3" time="10:20 AM" status="checked-in" owner="Sarah Martin" />
        <EntryRow dog="Daisy" regName="Willowbrook Fields Of Gold" breed="Poodle (Std)" trial="Saturday All-Breed" cls="Open Bitch" ring="Ring 1" time="11:00 AM" status="waiting" owner="Sarah Martin" />
        <EntryRow dog="Rosie" regName="Claremont Wild Rose" breed="Bulldog" trial="Sunday All-Breed" cls="Open Bitch" ring="Ring 4" time="10:30 AM" status="absent" owner="Sarah Martin" />
        <EntryRow dog="Atlas" regName="Everest North Star" breed="Bernese Mtn Dog" trial="Saturday All-Breed" cls="Best of Breed" ring="Ring 2" time="11:15 AM" status="checked-in" owner="Paul Greene" />
      </div>
    </SecretaryPageShell>
  );
}

function FilterChip({ label, count, active, tint }) {
  return (
    <button style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '10px 16px', borderRadius: 999,
      border: active ? '1px solid var(--terracotta-500)' : '1px solid var(--ivory-200)',
      background: active ? 'var(--terracotta-50)' : '#fff',
      color: active ? 'var(--terracotta-700)' : (tint === 'red' ? 'var(--chip-red-fg)' : 'var(--stone-700)'),
      fontSize: 14, fontWeight: 600, cursor: 'pointer',
      minHeight: 40,
    }}>
      {label}
      <span style={{
        background: active ? 'var(--terracotta-500)' : 'var(--ivory-100)',
        color: active ? '#fff' : 'var(--stone-700)',
        padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700,
      }}>{count}</span>
    </button>
  );
}

function EntryRow({ dog, regName, breed, trial, cls, ring, time, status, owner }) {
  const statusMap = {
    'checked-in': { label: 'Checked in', variant: 'green', icon: 'check-circle-2' },
    'waiting': { label: 'Not yet', variant: 'stone', icon: 'clock' },
    'absent': { label: 'Absent', variant: 'red', icon: 'x-circle' },
  };
  const s = statusMap[status];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '52px 1.4fr 1.2fr 1fr 1fr auto',
      gap: 16, alignItems: 'center',
      padding: '14px 18px', borderBottom: '1px solid var(--ivory-100)',
    }}>
      <PhotoPlaceholder initials={dog[0]} aspect="1 / 1" rounded={12} palette="amber" />
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-900)' }}>{dog}</div>
        <div style={{ fontSize: 13, color: 'var(--stone-600)' }}>{regName}</div>
        <div style={{ fontSize: 12, color: 'var(--stone-500)', marginTop: 2 }}>{breed} · {owner}</div>
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-900)' }}>{trial}</div>
        <div style={{ fontSize: 13, color: 'var(--stone-600)' }}>{cls}</div>
      </div>
      <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', color: 'var(--stone-700)' }}>{ring}</div>
      <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', color: 'var(--stone-700)' }}>{time}</div>
      <Chip variant={s.variant} icon={s.icon}>{s.label}</Chip>
    </div>
  );
}

Object.assign(window, {
  MY_SHOWS, ShowContextBar, SecretaryPageShell, SecretaryMyShows,
  SecretaryEntriesPage, PhaseBadge, InShowSidebar,
});
