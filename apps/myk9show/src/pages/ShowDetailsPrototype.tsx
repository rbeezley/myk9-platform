import { useState } from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  Medal,
  BarChart3,
  CheckCircle2,
  MapPin,
  Calendar,
  Users,
  FileText,
  Globe,
  Pencil,
  Trash2,
  ChevronDown,
  Copy,
  ListTree,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { DetailHero } from '@/components/common/DetailHero';
import { ShowDateBlock } from '@/components/shows/ShowDateBlock';
import { PrimaryTabs, PrimaryTabsContent } from '@/components/common/PrimaryTabs';
import type { PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const SHOW = {
  name: 'Pacific Northwest Scent Detection Trial',
  clubName: 'Cascade Canine Sports Club',
  organization: 'AKC',
  startDate: '2026-07-18',
  endDate: '2026-07-19',
  location: 'Evergreen Fairgrounds, Monroe WA',
  entryCloseDate: 'July 5',
  preEntryFee: 28,
  dayOfShowFee: 35,
};

const TRIALS = [
  { number: '1', date: 'Saturday, July 18', classCount: 12, entryCount: 47 },
  { number: '2', date: 'Sunday, July 19', classCount: 12, entryCount: 39 },
];

const CLASSES = [
  { element: 'Containers', level: 'Novice A', count: 14 },
  { element: 'Containers', level: 'Novice B', count: 11 },
  { element: 'Containers', level: 'Advanced', count: 8 },
  { element: 'Exteriors', level: 'Novice', count: 15 },
  { element: 'Interiors', level: 'Novice', count: 10 },
  { element: 'Buried', level: 'Novice', count: 9 },
];

const MY_CLASSES = [
  { element: 'Containers', level: 'Novice A', dog: 'Biscuit', time: '9:00 AM', date: 'July 18' },
  { element: 'Exteriors', level: 'Novice', dog: 'Biscuit', time: '11:30 AM', date: 'July 18' },
];

// ─── Fixed QuickInfoCards (warm chips, no indigo) ─────────────────────────────

const WARM_CHIP = 'bg-[#e8e6dc] border-[#d1cfc5] text-[#4d4c48] font-normal';

function InfoCell({
  label,
  value,
  secondary,
}: {
  label: string;
  value: string;
  secondary?: string;
}) {
  return (
    <div className="flex-1 min-w-[120px] px-4 py-2.5 border-r border-border/50 last:border-r-0">
      <div className="text-xs uppercase tracking-wide text-muted-foreground/70">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
      {secondary && <div className="text-xs text-muted-foreground mt-0.5">{secondary}</div>}
    </div>
  );
}

function FixedQuickInfoCards({ entryCount }: { entryCount?: number }) {
  return (
    <div className="flex flex-wrap">
      {entryCount !== undefined ? (
        <InfoCell label="Total Entries" value={String(entryCount)} secondary="across 2 trials" />
      ) : (
        <InfoCell label="Entries Close" value={SHOW.entryCloseDate} />
      )}
      <InfoCell label="Location" value={SHOW.location} />
      <InfoCell
        label="Entry Fee"
        value={`$${SHOW.preEntryFee}`}
        secondary={`Day of show: $${SHOW.dayOfShowFee}`}
      />
      <div className="flex-1 min-w-[120px] px-4 py-2.5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground/70 mb-1.5">
          Payment
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className={WARM_CHIP}>
            Card
          </Badge>
          <Badge variant="outline" className={WARM_CHIP}>
            Check
          </Badge>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Content ──────────────────────────────────────────────────────────────

function OverviewTab() {
  return (
    <div className="space-y-4 py-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">About This Show</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3">
          <p>
            Two-day AKC Scent Work trial hosted by Cascade Canine Sports Club at the Evergreen
            Fairgrounds. Offering Novice and Advanced elements across Containers, Exteriors,
            Interiors, and Buried searches.
          </p>
          <div className="flex items-center gap-2 text-foreground">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            Evergreen Fairgrounds, Monroe WA
          </div>
          <div className="flex items-center gap-2 text-foreground">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            July 18–19, 2026
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Judges</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            {[
              { name: 'Margaret Chen', elements: 'Containers, Exteriors' },
              { name: 'Robert Alvarez', elements: 'Interiors, Buried' },
            ].map(j => (
              <div key={j.name} className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Users className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="font-medium">{j.name}</div>
                  <div className="text-xs text-muted-foreground">{j.elements}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TrialsTab() {
  return (
    <div className="space-y-3 py-4">
      {TRIALS.map(trial => (
        <Card key={trial.number}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="font-medium">Trial {trial.number}</div>
              <div className="text-sm text-muted-foreground mt-0.5">{trial.date}</div>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <div>{trial.classCount} classes</div>
              <div>{trial.entryCount} entries</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ClassesTab() {
  return (
    <div className="py-4">
      <div className="rounded-xl border border-border overflow-hidden">
        {CLASSES.map((cls, i) => (
          <div
            key={cls.element + cls.level}
            className={cn(
              'flex items-center justify-between px-4 py-3 text-sm',
              i < CLASSES.length - 1 && 'border-b border-border/50'
            )}
          >
            <div>
              <span className="font-medium">{cls.element}</span>
              <span className="text-muted-foreground ml-2">{cls.level}</span>
            </div>
            <span className="text-xs text-muted-foreground">{cls.count} entered</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MyEntriesTab({ entered }: { entered: boolean }) {
  if (!entered) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        You haven&apos;t entered this show yet.{' '}
        <button className="text-foreground underline underline-offset-2">Enter This Show</button>
      </div>
    );
  }
  return (
    <div className="py-4 space-y-3">
      <p className="text-sm text-muted-foreground">Your entries for this show:</p>
      {MY_CLASSES.map(e => (
        <Card key={e.element + e.level}>
          <CardContent className="p-4 flex items-center gap-4">
            <CheckCircle2 className="h-5 w-5 text-[#c96442] flex-shrink-0" />
            <div className="flex-1">
              <div className="font-medium text-sm">
                {e.element} — {e.level}
              </div>
              <div className="text-xs text-muted-foreground">
                {e.dog} · {e.time}, {e.date}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyTab({ label }: { label: string }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{label}</div>;
}

// ─── Secretary Components ─────────────────────────────────────────────────────

type ShowStatus = 'draft' | 'published' | 'upcoming' | 'in_progress';

const STATUS_STYLES: Record<ShowStatus, string> = {
  draft: 'bg-amber-950 border border-amber-800 text-amber-400',
  published: 'bg-green-950 border border-green-800 text-green-400',
  upcoming: 'bg-blue-950 border border-blue-800 text-blue-400',
  in_progress: 'bg-orange-950 border border-orange-800 text-orange-400',
};
const STATUS_LABELS: Record<ShowStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  upcoming: 'Upcoming',
  in_progress: 'In Progress',
};

function SecretaryActions({
  status,
  onStatusChange,
}: {
  status: ShowStatus;
  onStatusChange: (s: ShowStatus) => void;
}) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const nextStatus: ShowStatus = status === 'draft' ? 'published' : 'draft';
  const nextLabel = status === 'draft' ? 'Publish Show' : 'Move to Draft';

  return (
    <div className="flex items-center gap-1.5">
      {/* Status pill — click to toggle draft/published */}
      <button
        onClick={() => onStatusChange(nextStatus)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
          STATUS_STYLES[status]
        )}
        title={nextLabel}
      >
        {STATUS_LABELS[status]}
        {(status === 'draft' || status === 'published') && (
          <ChevronDown className="h-3 w-3 opacity-70" />
        )}
      </button>

      {/* Primary action — most common secretary task */}
      <Button size="sm" variant="default" asChild>
        <a href="#">
          <LayoutDashboard className="h-4 w-4 mr-1.5" />
          Manage in Workbench
        </a>
      </Button>

      {/* Overflow menu: Edit + Delete — separated from primary to reduce mis-tap risk */}
      <div className="relative">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOverflowOpen(o => !o)}
          aria-label="More actions"
        >
          <span className="text-base leading-none tracking-widest">···</span>
        </Button>
        {overflowOpen && (
          <div className="absolute right-0 top-full mt-1 z-20 w-36 rounded-lg border border-border bg-popover shadow-md py-1">
            <button
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors"
              onClick={() => setOverflowOpen(false)}
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              Edit
            </button>
            <div className="h-px bg-border mx-2 my-1" />
            <button
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              onClick={() => setOverflowOpen(false)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Show
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ManagementCards({ status }: { status: ShowStatus }) {
  const isPublished = status !== 'draft';
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* Premium List card */}
      <Card className="p-4 flex items-center gap-4">
        <div className={cn('rounded-md p-3', isPublished ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
          <FileText className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">Premium List</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isPublished ? 'Published June 1, 2026' : 'Not yet published'}
          </p>
        </div>
        {isPublished && (
          <Button size="sm" variant="default">Download PDF</Button>
        )}
      </Card>

      {/* Landing Page card */}
      <Card className="p-4 flex items-center gap-4">
        <div className="bg-primary/10 text-primary rounded-md p-3">
          <Globe className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">Public Landing Page</h3>
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Heritage
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            myk9show.com/shows/4584f257...
          </p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0">
          <Copy className="h-3.5 w-3.5 mr-1.5" />
          Copy Link
        </Button>
      </Card>
    </div>
  );
}

const MOCK_ENTRIES = [
  { handler: 'Sarah Chen', dog: 'Biscuit', element: 'Containers', level: 'Novice A', status: 'confirmed' },
  { handler: 'Mike Torres', dog: 'Maple', element: 'Exteriors', level: 'Novice', status: 'confirmed' },
  { handler: 'Janet Wu', dog: 'Pepper', element: 'Containers', level: 'Advanced', status: 'pending' },
  { handler: 'Robert Hall', dog: 'Scout', element: 'Buried', level: 'Novice', status: 'confirmed' },
  { handler: 'Amy Liu', dog: 'Daisy', element: 'Interiors', level: 'Novice', status: 'confirmed' },
];

function AllEntriesTab() {
  return (
    <div className="py-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">86 total entries across 2 trials</p>
        <Button size="sm" variant="outline">Export CSV</Button>
      </div>
      <div className="rounded-xl border border-border overflow-hidden">
        {MOCK_ENTRIES.map((e, i) => (
          <div
            key={e.handler + e.dog}
            className={cn(
              'flex items-center justify-between px-4 py-3 text-sm',
              i < MOCK_ENTRIES.length - 1 && 'border-b border-border/50'
            )}
          >
            <div>
              <span className="font-medium">{e.handler}</span>
              <span className="text-muted-foreground ml-2">w/ {e.dog}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{e.element} · {e.level}</span>
              <span className={cn(
                'rounded-full px-2 py-0.5 font-medium',
                e.status === 'confirmed' ? 'bg-green-500/10 text-green-600' : 'bg-amber-500/10 text-amber-600'
              )}>
                {e.status}
              </span>
            </div>
          </div>
        ))}
        <div className="px-4 py-2.5 text-xs text-muted-foreground text-center border-t border-border/50">
          Showing 5 of 86 entries
        </div>
      </div>
    </div>
  );
}

// ─── Entry State Config (exhibitor) ──────────────────────────────────────────

type EntryState = 'accepting' | 'closing_soon' | 'closed' | 'already_entered';

interface StateConfig {
  badge: { label: string; variant: 'success' | 'warning' | 'destructive' | 'default' };
  ctaLabel?: string;
  closedMessage?: string;
  defaultTab: string;
}

const STATE_CONFIGS: Record<EntryState, StateConfig> = {
  accepting: {
    badge: { label: 'Accepting Entries', variant: 'success' },
    ctaLabel: 'Enter This Show',
    defaultTab: 'overview',
  },
  closing_soon: {
    badge: { label: 'Closing Soon', variant: 'warning' },
    ctaLabel: 'Enter This Show',
    closedMessage: 'Entries close July 5 — enter soon.',
    defaultTab: 'overview',
  },
  closed: {
    badge: { label: 'Entries Closed', variant: 'destructive' },
    closedMessage: 'Entry for this show is now closed.',
    defaultTab: 'overview',
  },
  already_entered: {
    badge: { label: 'Accepting Entries', variant: 'success' },
    ctaLabel: 'Manage Entry',
    defaultTab: 'my-entries',
  },
};

const EXHIBITOR_TABS: PrimaryTabDef[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'map', label: 'Show Map', icon: ListTree },
  { id: 'my-entries', label: 'My Entries', icon: ClipboardList },
  { id: 'my-stats', label: 'My Stats', icon: BarChart3 },
  { id: 'results', label: 'Results', icon: Medal },
];

const SECRETARY_TABS: PrimaryTabDef[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'map', label: 'Show Map', icon: ListTree },
  { id: 'results', label: 'Results', icon: Medal },
];

// ─── Main Prototype ───────────────────────────────────────────────────────────

type ViewMode = 'exhibitor' | 'secretary';

export default function ShowDetailsPrototype() {
  const [viewMode, setViewMode] = useState<ViewMode>('exhibitor');
  const [entryState, setEntryState] = useState<EntryState>('accepting');
  const [showStatus, setShowStatus] = useState<ShowStatus>('published');
  const [activeTab, setActiveTab] = useState('overview');

  function handleViewMode(mode: ViewMode) {
    setViewMode(mode);
    setActiveTab('overview');
  }

  function handleEntryState(state: EntryState) {
    setEntryState(state);
    setActiveTab(STATE_CONFIGS[state].defaultTab);
  }

  const cfg = STATE_CONFIGS[entryState];
  const isSecretary = viewMode === 'secretary';

  return (
    <PageShell>
      {/* Prototype toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-2.5 text-sm">
        {/* View mode toggle */}
        <div className="flex items-center gap-1 rounded-md border bg-background p-0.5">
          {(['exhibitor', 'secretary'] as ViewMode[]).map(m => (
            <button
              key={m}
              onClick={() => handleViewMode(m)}
              className={cn(
                'px-3 py-1 rounded text-xs font-medium transition-colors capitalize',
                viewMode === m ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Exhibitor entry states */}
        {!isSecretary && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">State:</span>
            {(Object.keys(STATE_CONFIGS) as EntryState[]).map(s => (
              <button
                key={s}
                onClick={() => handleEntryState(s)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
                  entryState === s
                    ? 'bg-background text-foreground shadow-sm border-border'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {s.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        )}

        {/* Secretary show status */}
        {isSecretary && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">Show status:</span>
            {(['draft', 'published', 'upcoming', 'in_progress'] as ShowStatus[]).map(s => (
              <button
                key={s}
                onClick={() => setShowStatus(s)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
                  showStatus === s
                    ? 'bg-background text-foreground shadow-sm border-border'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {s.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        )}
      </div>

      <PageHeader
        breadcrumbs={[
          { label: 'Shows', href: '/shows' },
          { label: SHOW.name, href: '/prototype/show' },
        ]}
        title={SHOW.name}
      />

      <DetailHero
        cover={<ShowDateBlock startDate={SHOW.startDate} endDate={SHOW.endDate} />}
        name={SHOW.name}
        subtitle={SHOW.clubName}
        badges={
          isSecretary
            ? [{ label: SHOW.organization, variant: 'default' }]
            : [{ label: SHOW.organization, variant: 'default' }, cfg.badge]
        }
        secondaryActions={
          isSecretary ? (
            <SecretaryActions status={showStatus} onStatusChange={setShowStatus} />
          ) : cfg.ctaLabel ? (
            <button
              className="h-12 px-6 text-base font-medium rounded-lg inline-flex items-center gap-2 transition-colors bg-[#c96442] hover:bg-[#b45a3a] text-[#faf9f5]"
              onClick={() => {}}
            >
              {cfg.ctaLabel}
            </button>
          ) : undefined
        }
        closedMessage={isSecretary ? undefined : cfg.closedMessage}
        footer={<FixedQuickInfoCards {...(isSecretary ? { entryCount: 86 } : {})} />}
      />

      {/* Management cards — secretary only */}
      {isSecretary && <ManagementCards status={showStatus} />}

      <PrimaryTabs
        tabs={isSecretary ? SECRETARY_TABS : EXHIBITOR_TABS}
        value={activeTab}
        onValueChange={setActiveTab}
      >
        <PrimaryTabsContent value="overview"><OverviewTab /></PrimaryTabsContent>
        <PrimaryTabsContent value="map">
          <EmptyTab label="Show Map — class and ring assignments across both trials." />
        </PrimaryTabsContent>
        <PrimaryTabsContent value="trials"><TrialsTab /></PrimaryTabsContent>
        <PrimaryTabsContent value="classes"><ClassesTab /></PrimaryTabsContent>
        <PrimaryTabsContent value="entries"><AllEntriesTab /></PrimaryTabsContent>
        <PrimaryTabsContent value="my-entries">
          <MyEntriesTab entered={entryState === 'already_entered'} />
        </PrimaryTabsContent>
        <PrimaryTabsContent value="my-stats">
          <EmptyTab label="Your performance stats for this show will appear here." />
        </PrimaryTabsContent>
        <PrimaryTabsContent value="results">
          <EmptyTab label="Results will be posted after the show." />
        </PrimaryTabsContent>
      </PrimaryTabs>
    </PageShell>
  );
}
