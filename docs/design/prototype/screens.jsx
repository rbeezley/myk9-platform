/* screens.jsx — All 6 entity types applied to the templates + detail pages */
/* global React, PageShell, PageHeader, Tabs, Card, Cover, Chip, Icon, Button, PhotoPlaceholder, InfoTile, SectionTitle, BrowseTemplateA, BrowseTemplateB, BrowseTemplateC, SearchStrip, QuickFilters, SHOWS, TRIALS, CLASSES, DOGS, CLUBS, PEOPLE */
const { useState: useStateS } = React;

// ============================================================
// DETAIL PAGE TEMPLATE — tabbed, with hero
// ============================================================
function DetailShell({ crumbs, hero, tabs, activeTab, onTab, children, active = 'shows', role = 'exhibitor' }) {
  return (
    <PageShell crumbs={crumbs} active={active} role={role}>
      {hero}
      <Tabs items={tabs} active={activeTab} onChange={onTab} />
      {children}
    </PageShell>
  );
}

function DetailHero({ eyebrow, title, palette = 'teal', subtitle, chips = [], primary, secondary, meta = [], cover }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 20, border: '1px solid var(--ivory-200)',
      marginBottom: 24, overflow: 'hidden',
      boxShadow: 'rgba(0,0,0,0.03) 0 2px 12px',
    }}>
      <div style={{ display: 'flex', gap: 28, padding: 28, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ width: 200, flexShrink: 0 }}>
          {cover || <PhotoPlaceholder initials={title.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()} palette={palette} aspect="1/1" rounded={16} />}
        </div>
        <div style={{ flex: 1, minWidth: 280 }}>
          {eyebrow && <div className="eyebrow" style={{ marginBottom: 8 }}>{eyebrow}</div>}
          <h1 className="serif" style={{ fontSize: 40, margin: 0, lineHeight: 1.1 }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 17, color: 'var(--stone-700)', margin: '8px 0 14px' }}>{subtitle}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            {chips.map((c, i) => <Chip key={i} variant={c.variant} icon={c.icon} size="lg">{c.label}</Chip>)}
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', color: 'var(--stone-700)', fontSize: 15, marginBottom: 20 }}>
            {meta.map((m, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Icon name={m.icon} size={18} style={{ color: 'var(--stone-500)' }} />
                <span>{m.label}: <strong style={{ color: 'var(--ink-900)' }}>{m.value}</strong></span>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {primary}
            {secondary}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SHOW DETAIL
// ============================================================
function ShowDetail({ show = SHOWS[1], role = 'exhibitor' }) {
  const [tab, setTab] = useStateS('overview');
  const isSec = role === 'secretary';
  const tabs = isSec ? [
    { key: 'overview', label: 'Overview', icon: 'layout-dashboard' },
    { key: 'trials', label: 'Trials', icon: 'trophy', count: show.trials },
    { key: 'classes', label: 'Classes', icon: 'list-checks', count: show.classes },
    { key: 'entries', label: 'All entries', icon: 'clipboard-list', count: show.entries },
    { key: 'schedule', label: 'Schedule', icon: 'calendar' },
    { key: 'results', label: 'Results', icon: 'medal' },
    { key: 'setup', label: 'Setup', icon: 'settings' },
    { key: 'reports', label: 'Reports', icon: 'file-text' },
  ] : [
    { key: 'overview', label: 'Overview', icon: 'layout-dashboard' },
    { key: 'trials', label: 'Trials', icon: 'trophy', count: show.trials },
    { key: 'classes', label: 'Classes', icon: 'list-checks', count: show.classes },
    { key: 'entries', label: 'My entries', icon: 'clipboard-list', count: 3 },
    { key: 'schedule', label: 'Schedule', icon: 'calendar' },
    { key: 'results', label: 'Results', icon: 'medal' },
  ];
  const crumbs = [isSec ? 'My shows' : 'Shows', show.name];
  return (
    <DetailShell crumbs={crumbs} activeTab={tab} onTab={setTab} tabs={tabs} active="shows" role={role}
      hero={<DetailHero
        eyebrow={isSec ? `You are running this show · ${show.dateRange}` : show.dateRange}
        title={show.name}
        subtitle={isSec ? `${show.kind} · ${show.entries} entries, ${show.trials} trials, ${show.judges} judges` : `Hosted by ${show.club} · ${show.kind}`}
        palette={show.palette}
        cover={<div style={{ borderRadius: 16, overflow: 'hidden' }}><Cover month={show.month} day={show.day} palette={show.palette} tall/></div>}
        chips={isSec ? [
          { variant: 'amber', icon: 'clock', label: 'Entries close in 2 days' },
          { variant: 'green', icon: 'check-circle-2', label: 'Premium list published' },
          { variant: 'stone', icon: 'users', label: `${show.entries} entries` },
        ] : [
          { variant: 'green', icon: 'check-circle-2', label: show.statusText },
          { variant: 'stone', icon: 'users', label: `${show.entries} entries` },
        ]}
        meta={[
          { icon: 'map-pin', label: 'Where', value: show.venue + ', ' + show.city },
          { icon: 'calendar', label: 'When', value: show.dateRange },
          { icon: 'dollar-sign', label: 'From', value: `$${show.fee} / entry` },
        ]}
        primary={isSec
          ? <Button size="xl" icon="settings" style={{ background: 'var(--terracotta-500)', borderColor: 'var(--terracotta-500)', color: '#fff' }}>Manage this show</Button>
          : <Button size="xl" icon="pencil-line">Sign up for this show</Button>}
        secondary={isSec
          ? <Button size="xl" variant="secondary" icon="download">Export catalog</Button>
          : <Button size="xl" variant="secondary" icon="file-text">Read premium list</Button>}
      />}
    >
      {tab === 'overview' && <ShowOverview show={show} />}
      {tab === 'trials' && <ShowTrials show={show} />}
      {tab === 'classes' && <ShowClasses show={show} />}
      {tab === 'entries' && <MyEntries show={show} />}
      {tab === 'schedule' && <EmptyTab label="Schedule will be published 3 days before the show." />}
      {tab === 'results' && <EmptyTab label="Results will appear here as judges post them on show day." />}
    </DetailShell>
  );
}

function ShowOverview({ show }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
      <div>
        <Card style={{ padding: 24, marginBottom: 20 }}>
          <SectionTitle title="About this show" />
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: 'var(--stone-700)' }}>
            The {show.name} is a {show.kind.toLowerCase()} held at {show.venue} in {show.city}. Hosted by the {show.club}, this event features {show.trials} trials across {show.classes} classes judged by {show.judges} approved judges.
          </p>
          <div style={{ height: 1, background: 'var(--ivory-200)', margin: '20px 0' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14 }}>
            <InfoTile icon="trophy" label="Trials" value={show.trials} />
            <InfoTile icon="list-checks" label="Classes" value={show.classes} mono />
            <InfoTile icon="users" label="Entries" value={show.entries} mono />
            <InfoTile icon="gavel" label="Judges" value={show.judges} />
          </div>
        </Card>
        <Card style={{ padding: 24 }}>
          <SectionTitle title="What happens next" sub="Step-by-step so you know what to expect" />
          <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {[
              { t: 'Sign up before Friday', b: 'Pick your dog, pick a class, pay the entry fee.' },
              { t: 'Get your confirmation', b: 'We email you a receipt and your armband numbers.' },
              { t: 'Show day', b: 'Arrive 30 min early, check in at the secretary table.' },
              { t: 'Results', b: 'Live updates on this page the minute your class ends.' },
            ].map((s, i) => (
              <li key={i} style={{ display: 'flex', gap: 16, padding: '14px 0', borderTop: i ? '1px solid var(--ivory-200)' : 'none' }}>
                <div className="mono" style={{
                  width: 40, height: 40, borderRadius: 999,
                  background: 'var(--teal-50)', color: 'var(--teal-700)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, flexShrink: 0, fontSize: 16,
                }}>{i + 1}</div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 600 }}>{s.t}</div>
                  <div style={{ fontSize: 15, color: 'var(--stone-600)', marginTop: 2 }}>{s.b}</div>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <div>
        <Card style={{ padding: 22, marginBottom: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Key dates</div>
          <DateRow label="Entries open" value="Mar 15" done />
          <DateRow label="Early bird ends" value="Apr 12" done />
          <DateRow label="Entries close" value="Apr 25" urgent />
          <DateRow label="Show day" value="Apr 26" />
        </Card>
        <Card style={{ padding: 22 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Help & contact</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <HelpRow icon="phone" label="Call secretary" value="(555) 382-1199" />
            <HelpRow icon="mail" label="Email" value="secretary@bergenkc.org" />
            <HelpRow icon="map-pin" label="Directions" value="Eisenhower Park" />
          </div>
        </Card>
      </div>
    </div>
  );
}
function DateRow({ label, value, done, urgent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--ivory-200)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {done ? <Icon name="check-circle-2" size={18} style={{ color: 'var(--success)' }} /> : urgent ? <Icon name="alert-circle" size={18} style={{ color: 'var(--warning)' }} /> : <Icon name="circle" size={18} style={{ color: 'var(--stone-300)' }} />}
        <span style={{ fontSize: 15, color: 'var(--stone-700)' }}>{label}</span>
      </div>
      <span className="mono" style={{ fontWeight: 600, color: urgent ? 'var(--warning)' : 'var(--ink-900)' }}>{value}</span>
    </div>
  );
}
function HelpRow({ icon, label, value }) {
  return (
    <button style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
      background: 'var(--ivory-100)', border: '1px solid var(--ivory-200)',
      borderRadius: 12, width: '100%', textAlign: 'left',
    }}>
      <Icon name={icon} size={18} style={{ color: 'var(--teal-600)' }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: 'var(--stone-500)' }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{value}</div>
      </div>
      <Icon name="chevron-right" size={18} style={{ color: 'var(--stone-500)' }} />
    </button>
  );
}

function ShowTrials({ show }) {
  const trials = TRIALS.filter(t => t.showId === show.id);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px,1fr))', gap: 20 }}>
      {trials.map(t => (
        <Card key={t.id} style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div className="eyebrow">{t.date}</div>
            <Chip variant={t.status === 'Accepting' ? 'green' : 'amber'} size="sm">{t.status}</Chip>
          </div>
          <h3 className="serif" style={{ fontSize: 22, margin: '0 0 14px', lineHeight: 1.2 }}>{t.name}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
            <InfoTile icon="square" label="Rings" value={t.rings} />
            <InfoTile icon="list-checks" label="Classes" value={t.classes} mono />
            <InfoTile icon="users" label="Entries" value={t.entries} mono />
          </div>
          <div style={{ fontSize: 14, color: 'var(--stone-600)', marginBottom: 16 }}>
            <strong style={{ color: 'var(--ink-900)' }}>Judges:</strong> {t.judges.join(', ')}
          </div>
          <Button full size="lg" icon="pencil-line">Sign up for this trial</Button>
        </Card>
      ))}
    </div>
  );
}

function ShowClasses({ show }) {
  return (
    <Card>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--ivory-200)', display: 'flex', gap: 10, alignItems: 'center' }}>
        <Icon name="filter" size={18} />
        <select style={selectStyle}><option>All trials</option></select>
        <select style={selectStyle}><option>All breeds</option></select>
        <div style={{ flex: 1 }} />
        <Button size="sm" icon="plus">Sign up for a class</Button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--ivory-100)', textAlign: 'left', color: 'var(--stone-600)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <th style={{ padding: '12px 20px' }}>Class</th>
            <th style={{ padding: '12px 20px' }}>Ring · Time</th>
            <th style={{ padding: '12px 20px' }}>Judge</th>
            <th style={{ padding: '12px 20px', textAlign: 'right' }}>Entries</th>
            <th style={{ padding: '12px 20px' }}>Status</th>
            <th style={{ padding: '12px 20px' }}></th>
          </tr>
        </thead>
        <tbody>
          {CLASSES.map(c => (
            <tr key={c.id} style={{ borderTop: '1px solid var(--ivory-200)', fontSize: 15 }}>
              <td style={{ padding: '14px 20px', fontWeight: 600 }}>{c.name}</td>
              <td style={{ padding: '14px 20px', color: 'var(--stone-600)' }}>
                <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{c.ring}</div>
                <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>{c.time}</div>
              </td>
              <td style={{ padding: '14px 20px' }}>{c.judge}</td>
              <td style={{ padding: '14px 20px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{c.entries}</td>
              <td style={{ padding: '14px 20px' }}><Chip variant={c.status === 'Accepting' ? 'green' : 'amber'} size="sm">{c.status}</Chip></td>
              <td style={{ padding: '14px 20px', textAlign: 'right' }}><Button size="sm" variant="secondary">Sign up</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
const selectStyle = { height: 40, padding: '0 14px', borderRadius: 10, border: '1px solid var(--ivory-200)', background: '#fff', fontFamily: 'inherit', fontSize: 14 };

function MyEntries({ show }) {
  const entries = DOGS.filter(d => d.status.includes('Entered')).slice(0, 3);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {entries.map(d => (
        <Card key={d.id} style={{ padding: 18, display: 'flex', gap: 16, alignItems: 'center' }}>
          <PhotoPlaceholder initials={d.callName.slice(0,1)} palette={d.palette} aspect="1/1" rounded={14} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 600, fontFamily: 'var(--font-serif)' }}>{d.callName}</div>
            <div style={{ fontSize: 14, color: 'var(--stone-600)' }}>{d.breed} · Armband <span className="mono" style={{ fontWeight: 700, color: 'var(--ink-900)' }}>#{112 + DOGS.indexOf(d)}</span></div>
          </div>
          <Chip variant="green" icon="check-circle-2">Confirmed</Chip>
          <Button size="md" variant="secondary" icon="pencil">Edit</Button>
        </Card>
      ))}
      <Card style={{ padding: 20, textAlign: 'center', borderStyle: 'dashed' }}>
        <Button size="lg" icon="plus">Add another dog to this show</Button>
      </Card>
    </div>
  );
}
function EmptyTab({ label }) {
  return (
    <Card style={{ padding: 48, textAlign: 'center' }}>
      <Icon name="clock" size={40} style={{ color: 'var(--stone-300)' }} />
      <div style={{ fontSize: 17, color: 'var(--stone-600)', marginTop: 14, maxWidth: 480, marginInline: 'auto' }}>{label}</div>
    </Card>
  );
}

// ============================================================
// DOG DETAIL
// ============================================================
function DogDetail({ dog = DOGS[0] }) {
  const [tab, setTab] = useStateS('overview');
  const tabs = [
    { key: 'overview', label: 'Overview', icon: 'layout-dashboard' },
    { key: 'entries', label: 'Entered', icon: 'clipboard-list', count: 2 },
    { key: 'results', label: 'Results', icon: 'medal', count: 24 },
    { key: 'career', label: 'Career stats', icon: 'bar-chart-3' },
    { key: 'health', label: 'Health & titles', icon: 'heart-pulse' },
  ];
  return (
    <DetailShell crumbs={['Dogs', dog.callName]} activeTab={tab} onTab={setTab} tabs={tabs} active="dogs"
      hero={<DetailHero
        eyebrow={dog.regName}
        title={dog.callName}
        subtitle={`${dog.breed} · ${dog.sex === 'B' ? 'Bitch' : 'Dog'} · ${dog.age}`}
        palette={dog.palette}
        chips={[
          { variant: 'teal', icon: 'trophy', label: dog.titles },
          { variant: 'stone', icon: 'user', label: `Owner: ${dog.owner}` },
        ]}
        meta={[
          { icon: 'award', label: 'Points', value: dog.points },
          { icon: 'ribbon', label: 'Ribbons', value: dog.ribbons },
          { icon: 'calendar', label: 'Status', value: dog.status },
        ]}
        primary={<Button size="xl" icon="pencil-line">Sign up for a show</Button>}
        secondary={<Button size="xl" variant="secondary" icon="pencil">Edit profile</Button>}
      />}
    >
      {tab === 'overview' && (
        <>
          <TitleProgress dogName={dog.callName} />
          <DogOverview dog={dog} />
        </>
      )}
      {tab !== 'overview' && <EmptyTab label={`${dog.callName}'s ${tab} will appear here.`} />}
    </DetailShell>
  );
}
function DogOverview({ dog }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
      <div>
        <Card style={{ padding: 24, marginBottom: 20 }}>
          <SectionTitle title="Career at a glance" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            <InfoTile icon="calendar" label="Shows" value={dog.career.shows} mono />
            <InfoTile icon="medal" label="Best of Breed" value={dog.career.bob} mono />
            <InfoTile icon="award" label="Best Opp. Sex" value={dog.career.bos} mono />
            <InfoTile icon="trophy" label="Points to CH" value={`${dog.points}/15`} mono />
          </div>
        </Card>
        <Card style={{ padding: 24 }}>
          <SectionTitle title="Next up" sub="Shows Maggie is entered in" />
          <ShowRowMini show={SHOWS[1]} />
          <ShowRowMini show={SHOWS[0]} />
        </Card>
      </div>
      <div>
        <Card style={{ padding: 22, marginBottom: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Registration</div>
          <InfoRow label="Reg. name" value={dog.regName} />
          <InfoRow label="Breed" value={dog.breed} />
          <InfoRow label="Sex" value={dog.sex === 'B' ? 'Bitch' : 'Dog'} />
          <InfoRow label="Age" value={dog.age} />
          <InfoRow label="Handler" value={dog.handler} />
        </Card>
      </div>
    </div>
  );
}
function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--ivory-200)', gap: 12 }}>
      <span style={{ fontSize: 14, color: 'var(--stone-600)' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  );
}
function ShowRowMini({ show }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--ivory-200)' }}>
      <div style={{ width: 60, flexShrink: 0 }}><Cover month={show.month} day={show.day} palette={show.palette} tall /></div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>{show.name}</div>
        <div style={{ fontSize: 13, color: 'var(--stone-600)' }}>{show.city} · {show.dateRange}</div>
      </div>
      <Chip variant="green" size="sm">Confirmed</Chip>
    </div>
  );
}

// ============================================================
// CLUB / PERSON / TRIAL / CLASS DETAIL (compact)
// ============================================================
function ClubDetail({ club = CLUBS[0] }) {
  const [tab, setTab] = useStateS('overview');
  const tabs = [
    { key: 'overview', label: 'Overview', icon: 'layout-dashboard' },
    { key: 'shows', label: 'Upcoming shows', icon: 'calendar-days', count: club.shows },
    { key: 'members', label: 'Members', icon: 'users', count: club.members },
    { key: 'history', label: 'History', icon: 'history' },
  ];
  return (
    <DetailShell crumbs={['Clubs', club.name]} activeTab={tab} onTab={setTab} tabs={tabs} active="clubs"
      hero={<DetailHero
        eyebrow={`Founded ${club.founded}`}
        title={club.name}
        subtitle={club.tagline}
        palette={club.palette}
        chips={[
          { variant: 'teal', icon: 'calendar', label: `Next show: ${club.next}` },
          { variant: 'stone', icon: 'users', label: `${club.members} members` },
        ]}
        meta={[
          { icon: 'map-pin', label: 'Based in', value: club.city },
          { icon: 'calendar-days', label: 'Upcoming shows', value: club.shows },
        ]}
        primary={<Button size="xl" icon="calendar-plus">See their next show</Button>}
        secondary={<Button size="xl" variant="secondary" icon="mail">Contact club</Button>}
      />}
    >
      {tab === 'shows' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px,1fr))', gap: 20 }}>
          {SHOWS.slice(0, 3).map(s => <CompactShowCard key={s.id} show={s} />)}
        </div>
      ) : <EmptyTab label="This section is coming soon." />}
    </DetailShell>
  );
}

function PersonDetail({ person = PEOPLE[0] }) {
  const [tab, setTab] = useStateS('overview');
  const tabs = [
    { key: 'overview', label: 'Overview', icon: 'layout-dashboard' },
    { key: 'judging', label: 'Judging schedule', icon: 'gavel', count: 4 },
    { key: 'history', label: 'Past assignments', icon: 'history' },
  ];
  return (
    <DetailShell crumbs={['People', person.name]} activeTab={tab} onTab={setTab} tabs={tabs} active="people"
      hero={<DetailHero
        eyebrow={person.role}
        title={person.name}
        subtitle={`${person.yearsJudging || '—'} years · approved for ${(person.approved || []).join(', ')}`}
        palette={person.palette}
        chips={[
          { variant: 'teal', icon: 'calendar', label: person.next },
          { variant: 'stone', icon: 'map-pin', label: person.city },
        ]}
        meta={[
          { icon: 'award', label: 'Approved groups', value: (person.approved || []).join(', ') },
          { icon: 'clock', label: 'Years', value: person.yearsJudging || '—' },
        ]}
        primary={<Button size="xl" icon="calendar">See their schedule</Button>}
      />}
    >
      <EmptyTab label="Full judging schedule coming soon." />
    </DetailShell>
  );
}

function CompactShowCard({ show }) {
  return (
    <Card>
      <Cover month={show.month} day={show.day} palette={show.palette} />
      <div style={{ padding: 18 }}>
        <h3 className="serif" style={{ fontSize: 19, margin: '0 0 6px' }}>{show.name}</h3>
        <div style={{ fontSize: 14, color: 'var(--stone-600)', marginBottom: 14 }}>{show.city} · {show.dateRange}</div>
        <Button size="md" full icon="pencil-line">Sign up</Button>
      </div>
    </Card>
  );
}

// ============================================================
// Browse pages for non-Shows entities (use Template B style)
// ============================================================
function BrowseDogs() {
  return (
    <div>
      <SearchStrip variant="inline" />
      <QuickFilters variant="compact" />
      <div style={{ fontSize: 15, color: 'var(--stone-600)', margin: '16px 0 14px' }}>
        <strong style={{ color: 'var(--ink-900)' }}>{DOGS.length} dogs</strong> in your team
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: 20 }}>
        {DOGS.map(d => (
          <Card key={d.id}>
            <div style={{ display: 'flex', gap: 16, padding: 18, alignItems: 'center' }}>
              <div style={{ width: 88, flexShrink: 0 }}>
                <PhotoPlaceholder initials={d.callName.slice(0,1)} palette={d.palette} aspect="1/1" rounded={14} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="serif" style={{ fontSize: 22, margin: '0 0 2px', lineHeight: 1.1 }}>{d.callName}</h3>
                <div style={{ fontSize: 13, color: 'var(--stone-500)', marginBottom: 6 }}>{d.regName}</div>
                <div style={{ fontSize: 14, color: 'var(--stone-700)' }}>{d.breed} · {d.age}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <Chip variant="teal" size="sm">{d.titles}</Chip>
                  {d.status.includes('Entered') && <Chip variant="green" size="sm" icon="check-circle-2">Entered</Chip>}
                </div>
              </div>
            </div>
            <div style={{ padding: '14px 18px', borderTop: '1px solid var(--ivory-200)', background: 'var(--ivory-100)', display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, color: 'var(--stone-600)' }}><span className="mono" style={{ fontWeight: 700, color: 'var(--ink-900)' }}>{d.career.shows}</span> shows · <span className="mono" style={{ fontWeight: 700, color: 'var(--ink-900)' }}>{d.ribbons}</span> ribbons</div>
              <Button size="sm" iconRight="chevron-right">View profile</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function BrowseClubs() {
  return (
    <div>
      <SearchStrip variant="inline" />
      <QuickFilters variant="compact" />
      <div style={{ fontSize: 15, color: 'var(--stone-600)', margin: '16px 0 14px' }}>
        <strong style={{ color: 'var(--ink-900)' }}>{CLUBS.length} clubs</strong> near you
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px,1fr))', gap: 20 }}>
        {CLUBS.map(c => (
          <Card key={c.id}>
            <div style={{ padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <PhotoPlaceholder initials={c.name.split(' ').slice(0,2).map(w=>w[0]).join('')} palette={c.palette} aspect="1/1" rounded={12} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 className="serif" style={{ fontSize: 20, margin: '0 0 2px', lineHeight: 1.1 }}>{c.name}</h3>
                  <div style={{ fontSize: 13, color: 'var(--stone-500)' }}>{c.city} · est. {c.founded}</div>
                </div>
              </div>
              <div style={{ fontSize: 14, color: 'var(--stone-600)', marginBottom: 12 }}>{c.tagline}</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--stone-700)', marginBottom: 16 }}>
                <span><span className="mono" style={{ fontWeight: 700, color: 'var(--ink-900)' }}>{c.members}</span> members</span>
                <span><span className="mono" style={{ fontWeight: 700, color: 'var(--ink-900)' }}>{c.shows}</span> shows / year</span>
              </div>
              <Button full size="md" iconRight="chevron-right">Next show: {c.next}</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function BrowsePeople() {
  return (
    <div>
      <SearchStrip variant="inline" />
      <QuickFilters variant="compact" />
      <div style={{ fontSize: 15, color: 'var(--stone-600)', margin: '16px 0 14px' }}>
        <strong style={{ color: 'var(--ink-900)' }}>{PEOPLE.length} judges and handlers</strong>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 16 }}>
        {PEOPLE.map(p => (
          <Card key={p.id} style={{ padding: 18 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12 }}>
              <PhotoPlaceholder initials={p.name.split(' ').map(w=>w[0]).join('')} palette={p.palette} aspect="1/1" rounded={999} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 2px' }}>{p.name}</h3>
                <div style={{ fontSize: 13, color: 'var(--stone-500)' }}>{p.role}</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--stone-600)', marginBottom: 10 }}>{p.city}</div>
            {p.approved && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {p.approved.map(g => <Chip key={g} variant="stone" size="sm">{g}</Chip>)}
              </div>
            )}
            <Button size="sm" full variant="secondary" iconRight="chevron-right">{p.next}</Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

function BrowseTrials() {
  return (
    <div>
      <SearchStrip variant="inline" />
      <QuickFilters variant="compact" />
      <div style={{ fontSize: 15, color: 'var(--stone-600)', margin: '16px 0 12px' }}>
        <strong style={{ color: 'var(--ink-900)' }}>{TRIALS.length} upcoming trials</strong> · sorted by date
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {TRIALS.map(t => {
          const show = SHOWS.find(s => s.id === t.showId);
          const accepting = t.status === 'Accepting';
          return (
            <Card key={t.id}>
              <div data-browse-row style={{ display: 'flex', gap: 20, padding: 18, alignItems: 'center' }}>
                <div style={{ width: 160, flexShrink: 0 }}>
                  <Cover month={show?.month} day={show?.day} palette={t.palette} tall />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span className="eyebrow">{t.date}</span>
                    {accepting
                      ? <Chip variant="green" size="sm">Accepting</Chip>
                      : <Chip variant="amber" size="sm">{t.status}</Chip>}
                  </div>
                  <h3 className="serif" style={{ fontSize: 22, margin: '0 0 6px', lineHeight: 1.2 }}>{t.name}</h3>
                  <div style={{ fontSize: 14, color: 'var(--stone-600)', marginBottom: 10 }}>
                    {show ? `${show.name} · ${show.city}` : '—'}
                  </div>
                  <div data-browse-meta style={{ display: 'flex', gap: 20, fontSize: 14, color: 'var(--stone-700)', flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="grid-2x2" size={15}/> <span className="mono">{t.rings}</span> rings
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="list" size={15}/> <span className="mono">{t.classes}</span> classes
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="users" size={15}/> <span className="mono">{t.entries}</span> entries
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="gavel" size={15}/> {t.judges?.join(', ') || '—'}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                  <Button size="lg" icon="pencil-line">Sign up</Button>
                  <Button size="sm" variant="ghost" iconRight="chevron-right">View details</Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function BrowseClasses() {
  return (
    <div>
      <SearchStrip variant="inline" />
      <QuickFilters variant="compact" />
      <Card style={{ marginTop: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--ivory-100)', textAlign: 'left', color: 'var(--stone-600)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <th style={{ padding: '14px 20px' }}>Class</th>
              <th style={{ padding: '14px 20px' }}>Ring · Time</th>
              <th style={{ padding: '14px 20px' }}>Judge</th>
              <th style={{ padding: '14px 20px', textAlign: 'right' }}>Entries</th>
              <th style={{ padding: '14px 20px' }}>Status</th>
              <th style={{ padding: '14px 20px' }}></th>
            </tr>
          </thead>
          <tbody>
            {CLASSES.map(c => (
              <tr key={c.id} style={{ borderTop: '1px solid var(--ivory-200)', fontSize: 15 }}>
                <td style={{ padding: '16px 20px', fontWeight: 600 }}>{c.name}</td>
                <td style={{ padding: '16px 20px' }}>
                  <div style={{ fontWeight: 600 }}>{c.ring}</div>
                  <div className="mono" style={{ fontSize: 13, color: 'var(--stone-600)' }}>{c.time}</div>
                </td>
                <td style={{ padding: '16px 20px' }}>{c.judge}</td>
                <td style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{c.entries}</td>
                <td style={{ padding: '16px 20px' }}><Chip variant={c.status === 'Accepting' ? 'green' : 'amber'} size="sm">{c.status}</Chip></td>
                <td style={{ padding: '16px 20px', textAlign: 'right' }}><Button size="sm">Sign up</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

Object.assign(window, {
  ShowDetail, DogDetail, ClubDetail, PersonDetail,
  BrowseDogs, BrowseClubs, BrowsePeople, BrowseTrials, BrowseClasses,
});
