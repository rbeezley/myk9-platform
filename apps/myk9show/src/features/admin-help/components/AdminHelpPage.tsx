import { useCallback, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserRole } from '@/types/auth-types';
import { fullRouteRegistry } from '@/routes/routeRegistry';
import { pageDirectory } from '../data/pageDirectory';
import { useExampleIds } from '../hooks/useExampleIds';
import { resolveExamplePath } from '../utils/resolveExamplePath';
import { routeDiff } from '../utils/routeDiff';
import { PageDirectorySection } from './PageDirectorySection';
import { UndocumentedRoutesPanel } from './UndocumentedRoutesPanel';
import { PageFlowDiagram } from './PageFlowDiagram';
import { ViewToggle } from '@/components/common/ViewToggle';
import type { PageClassification, PageEntry, PageStatus } from '../types';

const ROLE_ORDER: { role: UserRole; title: string; key: string }[] = [
  { role: UserRole.SITE_ADMIN, title: 'Site Admin', key: 'site-admin' },
  { role: UserRole.SECRETARY, title: 'Secretary', key: 'secretary' },
  { role: UserRole.CLUB_ADMIN, title: 'Club Admin', key: 'club-admin' },
  { role: UserRole.JUDGE, title: 'Judge', key: 'judge' },
  { role: UserRole.EXHIBITOR, title: 'Exhibitor', key: 'exhibitor' },
];

const VIEW_MODES = [
  { key: 'list', label: 'List', icon: 'list' as const },
  { key: 'flow', label: 'Flow', icon: 'flow' as const },
] as const;

const ALL = 'all';

const CATEGORIES = Array.from(new Set(pageDirectory.map(e => e.category))).sort();

const ROUTE_DIFF = routeDiff(fullRouteRegistry, pageDirectory);

export function AdminHelpPage() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | typeof ALL>(ALL);
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);
  const [classificationFilter, setClassificationFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [showParked, setShowParked] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const [viewMode, setViewModeRaw] = useState<'list' | 'flow'>(() => {
    try {
      const stored = localStorage.getItem('view-pref-admin-help');
      return stored === 'flow' ? 'flow' : 'list';
    } catch {
      return 'list';
    }
  });

  const setViewMode = useCallback((mode: string) => {
    const validated: 'list' | 'flow' = mode === 'flow' ? 'flow' : 'list';
    setViewModeRaw(validated);
    try {
      localStorage.setItem('view-pref-admin-help', validated);
    } catch (_e) {
      // localStorage may be unavailable in private browsing — ignore silently
    }
  }, []);

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
    <div className="container mx-auto max-w-5xl space-y-4 py-6">
      <header>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Page Directory</h1>
            <p className="text-sm text-muted-foreground">
              Every page in myK9Show, grouped by role.
            </p>
          </div>
          <ViewToggle modes={VIEW_MODES} active={viewMode} onChange={setViewMode} />
        </div>
      </header>

      <div className="space-y-3 rounded-lg border bg-card p-3">
        <Input
          placeholder="Search pages by title, description, path…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="grid gap-2 md:grid-cols-4">
          <Select value={roleFilter} onValueChange={v => setRoleFilter(v as UserRole | typeof ALL)}>
            <SelectTrigger>
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All roles</SelectItem>
              {ROLE_ORDER.map(r => (
                <SelectItem key={r.role} value={r.role}>
                  {r.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {CATEGORIES.map(c => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={classificationFilter} onValueChange={setClassificationFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Classification" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All classifications</SelectItem>
              <SelectItem value="critical-path">Critical path</SelectItem>
              <SelectItem value="park">Park</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="working">Working</SelectItem>
              <SelectItem value="stub">Stub</SelectItem>
              <SelectItem value="known-issues">Known issues</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={showParked}
              onCheckedChange={v => setShowParked(v === true)}
              aria-label="Show parked pages"
            />
            Show parked pages
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={showHidden}
              onCheckedChange={v => setShowHidden(v === true)}
              aria-label="Show hidden / dev pages"
            />
            Show hidden/dev pages
          </label>
        </div>
      </div>

      {viewMode === 'flow' ? (
        <PageFlowDiagram pages={filtered} />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

export default AdminHelpPage;
