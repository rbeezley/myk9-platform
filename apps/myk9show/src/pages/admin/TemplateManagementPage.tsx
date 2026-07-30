import React, { useState, useMemo } from 'react';
import { useSportTemplatesWithRulesQuery } from '@/hooks/queries/useSportTemplates';
import type { SportTemplateRow, SportClassRuleRow } from '@/types/sport-template-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileText, Info, ArrowLeft, AlertTriangle } from 'lucide-react';
import '@/styles/myk9-template-management.css';
import { CardGridSkeleton } from '@/components/common/SkeletonLoaders';

type SportTemplateWithRules = SportTemplateRow & { sport_class_rules: SportClassRuleRow[] };

const ALL = 'all';

/** "180s", "180–300s", or "—" */
function formatMaxTime(rule: SportClassRuleRow): string {
  if (rule.max_time_seconds_fixed != null) return `${rule.max_time_seconds_fixed}s`;
  const { max_time_seconds_min: min, max_time_seconds_max: max } = rule;
  if (min != null && max != null) return min === max ? `${min}s` : `${min}–${max}s`;
  if (min != null) return `≥${min}s`;
  if (max != null) return `≤${max}s`;
  return '—';
}

/** "1", "1–3", or "—" */
function formatRange(fixed: number | null, min: number | null, max: number | null): string {
  if (fixed != null) return String(fixed);
  if (min != null && max != null) return min === max ? String(min) : `${min}–${max}`;
  if (min != null) return `≥${min}`;
  if (max != null) return `≤${max}`;
  return '—';
}

const RulesTable: React.FC<{ template: SportTemplateWithRules }> = ({ template }) => {
  const rules = [...template.sport_class_rules].sort(
    (a, b) => a.display_order - b.display_order || a.class_name.localeCompare(b.class_name)
  );

  if (rules.length === 0) {
    return (
      <div className="myk9-template-empty">
        <h3 className="myk9-template-empty-title">No class rules seeded</h3>
        <p className="myk9-template-empty-description">
          This registry has a <code>sport_templates</code> row but no <code>sport_class_rules</code>
          . A seed migration is missing or incomplete.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">
          Seeded class rules for {template.organization} {template.sport_name}
        </caption>
        <thead>
          <tr className="border-b text-left">
            <th scope="col" className="p-2">
              Class
            </th>
            <th scope="col" className="p-2">
              Element
            </th>
            <th scope="col" className="p-2">
              Level
            </th>
            <th scope="col" className="p-2">
              Section
            </th>
            <th scope="col" className="p-2">
              Max time
            </th>
            <th scope="col" className="p-2">
              Hides
            </th>
            <th scope="col" className="p-2">
              Areas
            </th>
            <th scope="col" className="p-2">
              Timer
            </th>
            <th scope="col" className="p-2">
              Distractions
            </th>
            <th scope="col" className="p-2">
              Blank
            </th>
            <th scope="col" className="p-2">
              Odors
            </th>
          </tr>
        </thead>
        <tbody>
          {rules.map(rule => (
            <tr key={rule.id} className="border-b last:border-0">
              <th scope="row" className="p-2 text-left font-medium">
                {rule.class_name}
              </th>
              <td className="p-2">{rule.element}</td>
              <td className="p-2">{rule.level ?? '—'}</td>
              <td className="p-2">{rule.section ?? '—'}</td>
              <td className="p-2">{formatMaxTime(rule)}</td>
              <td className="p-2">
                {formatRange(rule.hide_count_fixed, rule.hide_count_min, rule.hide_count_max)}
                {rule.hides_known ? ' (known)' : ''}
              </td>
              <td className="p-2">{rule.area_count}</td>
              <td className="p-2">{rule.timer_mode}</td>
              <td className="p-2">
                {rule.distraction_count_min === rule.distraction_count_max
                  ? rule.distraction_count_min
                  : `${rule.distraction_count_min}–${rule.distraction_count_max}`}
              </td>
              <td className="p-2">{rule.has_blank ? 'yes' : 'no'}</td>
              <td className="p-2">{rule.odors.length > 0 ? rule.odors.join(', ') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * Read-only view of the sport rules actually seeded in `sport_templates` /
 * `sport_class_rules`.
 *
 * INTENT: This page has no create/edit/delete affordances, and it reads the DATABASE
 * directly via useSportTemplatesWithRulesQuery — never the templateStore, which falls
 * back to bundled fixtures when a fetch fails and would present mock data as seeded
 * truth. Its whole job is telling you whether a migration landed, so it must fail
 * loudly rather than show something plausible. See
 * docs/plan-template-authoring-removal.md.
 */
const TemplateManagementPage: React.FC = () => {
  const { data, isLoading, isError, error } = useSportTemplatesWithRulesQuery();

  const [searchTerm, setSearchTerm] = useState('');
  const [organization, setOrganization] = useState<string>(ALL);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const templates = useMemo<SportTemplateWithRules[]>(() => data ?? [], [data]);

  const organizations = useMemo(
    () => Array.from(new Set(templates.map(t => t.organization))).sort(),
    [templates]
  );

  const visible = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return templates.filter(template => {
      if (organization !== ALL && template.organization !== organization) return false;
      if (!term) return true;
      return (
        template.sport_name.toLowerCase().includes(term) ||
        template.organization.toLowerCase().includes(term) ||
        template.sport_code.toLowerCase().includes(term)
      );
    });
  }, [templates, searchTerm, organization]);

  const hasFilters = searchTerm !== '' || organization !== ALL;
  const selected = templates.find(t => t.id === selectedId) ?? null;

  if (selected) {
    return (
      <div className="myk9-template-page">
        <div className="myk9-template-container">
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to all sport rules
          </Button>

          <div className="myk9-template-header">
            <h1 className="myk9-template-title">
              {selected.organization} {selected.sport_name}
            </h1>
            <p className="myk9-template-subtitle">
              <code>{selected.sport_code}</code> · {selected.sport_class_rules.length} class rules ·{' '}
              {selected.elements.length} elements · {selected.levels.length} levels · sections:{' '}
              {selected.section_mode}
            </p>
          </div>

          <RulesTable template={selected} />
        </div>
      </div>
    );
  }

  return (
    <div className="myk9-template-page">
      <div className="myk9-template-container">
        <div className="myk9-template-header">
          <h1 className="myk9-template-title">Sport Rules</h1>
          <p className="myk9-template-subtitle">
            The class rules currently seeded in the database, by registry.
          </p>
        </div>

        <div
          className="myk9-filter-section flex items-start gap-3"
          role="note"
          aria-label="How sport rules are changed"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="myk9-template-description">
            This view is read-only and reads the database directly. Sport rules are reference data —
            a change affects every future show, so they are edited by reviewed migration rather than
            in the app. Use this page to confirm what a migration actually seeded.
          </p>
        </div>

        {isError && (
          <div className="myk9-filter-section flex items-start gap-3" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">Could not read sport rules from the database.</p>
              <p className="myk9-template-description">
                Nothing is shown below rather than falling back to cached or bundled data — this
                page would be useless if it could not be trusted.{' '}
                {error instanceof Error ? error.message : String(error)}
              </p>
            </div>
          </div>
        )}

        {!isError && (
          <div className="myk9-filter-section">
            <h2 className="myk9-filter-title">Filters</h2>
            <div className="myk9-filter-grid">
              <Input
                className="myk9-filter-input"
                placeholder="Search by sport, registry, or code"
                aria-label="Search sport rules"
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
              />

              <Select value={organization} onValueChange={setOrganization}>
                <SelectTrigger aria-label="Filter by registry">
                  <SelectValue placeholder="All registries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All registries</SelectItem>
                  {organizations.map(org => (
                    <SelectItem key={org} value={org}>
                      {org}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {hasFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('');
                    setOrganization(ALL);
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="myk9-templates-section">
          {isLoading ? (
            <div role="status" aria-label="Loading sport rules">
              <CardGridSkeleton items={6} />
            </div>
          ) : isError ? null : (
            <div className="myk9-templates-grid">
              {visible.map(template => (
                <button
                  key={template.id}
                  type="button"
                  className="myk9-template-card text-left"
                  onClick={() => setSelectedId(template.id)}
                  aria-label={`View ${template.sport_class_rules.length} class rules for ${template.organization} ${template.sport_name}`}
                >
                  <div className="myk9-template-card-header">
                    <div className="myk9-template-card-icon">
                      <FileText className="h-6 w-6" />
                    </div>
                  </div>

                  <div className="myk9-template-card-content">
                    <h3 className="myk9-template-card-title">{template.sport_name}</h3>
                    <p className="myk9-template-card-organization">{template.organization}</p>
                    <p className="myk9-template-card-showtype">{template.sport_code}</p>

                    <div className="myk9-template-card-meta">
                      <span className="myk9-template-card-version">
                        {template.sport_class_rules.length} class rules
                      </span>
                      <span className="myk9-template-card-date">
                        {new Date(template.updated_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="myk9-template-card-badges">
                      <span className="myk9-template-badge active">
                        {template.elements.length} elements
                      </span>
                      <span className="myk9-template-badge active">
                        {template.levels.length} levels
                      </span>
                    </div>
                  </div>
                </button>
              ))}

              {visible.length === 0 && (
                <div className="myk9-template-empty">
                  <h3 className="myk9-template-empty-title">
                    {templates.length === 0
                      ? 'No sport rules are seeded'
                      : 'No sport rules match those filters'}
                  </h3>
                  <p className="myk9-template-empty-description">
                    {templates.length === 0
                      ? 'The sport_templates table returned no active rows. Sport rules arrive via database migration.'
                      : 'Clear the filters to see every seeded registry.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TemplateManagementPage;
