import { useCallback, useMemo } from 'react';
import { useListUrlParams } from '@/hooks/useListUrlParams';
import { ListFilterBar, ListResultLine, type ListFilterField } from '@/components/list-toolkit';
import { UserRole } from '@/types/auth-types';
import { fullRouteRegistry } from '@/routes/routeRegistry';
import { pageDirectory } from '../data/pageDirectory';
import { useExampleIds } from '../hooks/useExampleIds';
import { resolveExamplePath } from '../utils/resolveExamplePath';
import { routeDiff } from '../utils/routeDiff';
import { PageDirectorySection } from './PageDirectorySection';
import { UndocumentedRoutesPanel } from './UndocumentedRoutesPanel';
import type { PageClassification, PageEntry, PageStatus } from '../types';

const ROLE_ORDER: { role: UserRole; title: string; key: string }[] = [
  { role: UserRole.SITE_ADMIN, title: 'Site Admin', key: 'site-admin' },
  { role: UserRole.SECRETARY, title: 'Secretary', key: 'secretary' },
  { role: UserRole.CLUB_ADMIN, title: 'Club Admin', key: 'club-admin' },
  { role: UserRole.JUDGE, title: 'Judge', key: 'judge' },
  { role: UserRole.EXHIBITOR, title: 'Exhibitor', key: 'exhibitor' },
];

const ALL = 'all';
const ROLE_VALUES = ROLE_ORDER.map(r => r.role);

const CATEGORIES = Array.from(new Set(pageDirectory.map(e => e.category))).sort();

const PAGE_NOUN = ['page', 'pages'] as const;

const CLASSIFICATION_OPTIONS = [
  { value: 'critical-path', label: 'Critical path' },
  { value: 'park', label: 'Park' },
  { value: 'hidden', label: 'Hidden' },
];

const STATUS_OPTIONS = [
  { value: 'working', label: 'Working' },
  { value: 'stub', label: 'Stub' },
  { value: 'known-issues', label: 'Known issues' },
];

const ROUTE_DIFF = routeDiff(fullRouteRegistry, pageDirectory);

export function AdminHelpPage() {
  const { searchParams, patch, readOneOf } = useListUrlParams();
  const search = searchParams.get('q') ?? '';
  const roleFilter = readOneOf('role', ROLE_VALUES) ?? ALL;
  const categoryFilter = readOneOf('category', CATEGORIES) ?? ALL;
  const classificationFilter =
    readOneOf(
      'classification',
      CLASSIFICATION_OPTIONS.map(o => o.value)
    ) ?? ALL;
  const statusFilter =
    readOneOf(
      'status',
      STATUS_OPTIONS.map(o => o.value)
    ) ?? ALL;
  const showParked = searchParams.get('parked') === 'shown';
  const showHidden = searchParams.get('hidden') === 'shown';

  const { data: ids, isLoading } = useExampleIds();

  const filtered: PageEntry[] = useMemo(() => {
    const term = search.trim().toLowerCase();
    return pageDirectory.filter(entry => {
      if (!showParked && entry.classification === 'park') return false;
      if (!showHidden && entry.classification === 'hidden') return false;
      if (roleFilter !== ALL && !entry.roles.includes(roleFilter)) return false;
      if (categoryFilter !== ALL && entry.category !== categoryFilter) return false;
      if (
        classificationFilter !== ALL &&
        entry.classification !== (classificationFilter as PageClassification)
      )
        return false;
      if (statusFilter !== ALL && entry.status !== (statusFilter as PageStatus)) return false;
      if (term) {
        const haystack =
          `${entry.title} ${entry.description} ${entry.path} ${entry.category}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [
    search,
    roleFilter,
    categoryFilter,
    classificationFilter,
    statusFilter,
    showParked,
    showHidden,
  ]);

  const filterFields: ListFilterField[] = [
    {
      kind: 'options',
      key: 'role',
      label: 'Role',
      allLabel: 'All roles',
      options: ROLE_ORDER.map(r => ({ value: r.role, label: r.title })),
      value: roleFilter === ALL ? null : roleFilter,
      onChange: value => patch({ role: value }),
    },
    {
      kind: 'options',
      key: 'category',
      label: 'Category',
      allLabel: 'All categories',
      options: CATEGORIES.map(c => ({ value: c, label: c })),
      value: categoryFilter === ALL ? null : categoryFilter,
      onChange: value => patch({ category: value }),
    },
    {
      kind: 'options',
      key: 'classification',
      label: 'Classification',
      allLabel: 'All classifications',
      options: CLASSIFICATION_OPTIONS,
      value: classificationFilter === ALL ? null : classificationFilter,
      onChange: value => patch({ classification: value }),
    },
    {
      kind: 'options',
      key: 'status',
      label: 'Status',
      allLabel: 'All statuses',
      options: STATUS_OPTIONS,
      value: statusFilter === ALL ? null : statusFilter,
      onChange: value => patch({ status: value }),
    },
    // Parked and hidden pages are left out until asked for, so each is a
    // two-way field whose unfiltered entry is "Hidden".
    {
      kind: 'options',
      key: 'parked',
      label: 'Parked pages',
      allLabel: 'Hidden',
      options: [{ value: 'shown', label: 'Shown' }],
      value: showParked ? 'shown' : null,
      onChange: value => patch({ parked: value === 'shown' ? 'shown' : null }),
    },
    {
      kind: 'options',
      key: 'hidden',
      label: 'Hidden/dev pages',
      allLabel: 'Hidden',
      options: [{ value: 'shown', label: 'Shown' }],
      value: showHidden ? 'shown' : null,
      onChange: value => patch({ hidden: value === 'shown' ? 'shown' : null }),
    },
  ];

  const showAllPages = () =>
    patch({
      q: null,
      role: null,
      category: null,
      classification: null,
      status: null,
      parked: 'shown',
      hidden: 'shown',
    });

  const grouped = useMemo(() => {
    return ROLE_ORDER.map(r => ({
      ...r,
      entries: filtered.filter(e => e.roles.includes(r.role)),
    })).filter(group => group.entries.length > 0);
  }, [filtered]);

  const resolvePath = useCallback(
    (path: string): string | null => (ids ? resolveExamplePath(path, ids) : null),
    [ids]
  );

  return (
    <div className="container mx-auto max-w-5xl space-y-4 px-6 py-6">
      <header>
        <h1 className="font-display text-2xl font-bold">Page Directory</h1>
        {/* Not "every page". This sits on the same screen as the amber drift
          panel below, which lists routes the directory does NOT carry — the old
          copy contradicted it in view. Two limits keep the replacement honest.
          Make no claim about which KINDS of route are in or out: the list
          carries some redirects (/my-entries, /browse-shows) and omits others.
          And say "registered routes", because routeDiff compares against
          fullRouteRegistry — a page routed but never registered there, like
          /account, is invisible to the panel, so promising it flags anything
          uncatalogued would be the same overclaim a third time. */}
        <p className="text-sm text-muted-foreground">
          myK9Show&apos;s user-facing pages, grouped by role. The list is hand-authored; registered
          routes it does not carry are flagged under Directory drift below.
        </p>
      </header>

      <ListFilterBar
        searchValue={search}
        onSearchChange={value => patch({ q: value || null })}
        searchPlaceholder="Search pages by title, description, path"
        fields={filterFields}
      />
      <ListResultLine
        shown={filtered.length}
        total={pageDirectory.length}
        noun={PAGE_NOUN}
        filtered={filtered.length !== pageDirectory.length}
        onShowAll={showAllPages}
      />

      {grouped.length === 0 && (
        <div className="rounded-lg border p-6 text-center text-muted-foreground">
          No pages match the current filters.
        </div>
      )}

      <div className="space-y-3">
        {grouped.map(group => (
          <PageDirectorySection
            key={group.key}
            roleKey={group.key}
            title={group.title}
            entries={group.entries}
            resolvePath={resolvePath}
            loading={isLoading}
          />
        ))}
      </div>

      <UndocumentedRoutesPanel missing={ROUTE_DIFF.missing} extra={ROUTE_DIFF.extra} />
    </div>
  );
}

export default AdminHelpPage;
