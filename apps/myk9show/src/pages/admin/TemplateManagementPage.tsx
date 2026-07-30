import React, { useState, useMemo } from 'react';
import { useTemplateStore } from '@/store/templateStore';
import { useTemplates } from '@/hooks/useTemplates';
import { Organization, TrialType, ClassTemplate } from '@/types/template.types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileText, Info, X } from 'lucide-react';
import '@/styles/myk9-template-management.css';
import { CardGridSkeleton } from '@/components/common/SkeletonLoaders';
import { SportRulesDetail } from '@/components/templates/SportRulesDetail';

const ALL = 'all';

/**
 * Read-only view of the sport rules seeded in `sport_templates` /
 * `sport_class_rules`.
 *
 * INTENT: This page deliberately has no create/edit/delete affordances. Sport
 * rules are reference data changed by reviewed migration, never from the client
 * — a malformed rule would affect every future show. See
 * docs/plan-template-authoring-removal.md. Do not re-add authoring controls here.
 */
const TemplateManagementPage: React.FC = () => {
  const { error, clearError } = useTemplateStore();
  const { templates, isLoading } = useTemplates();

  const [searchTerm, setSearchTerm] = useState('');
  const [organization, setOrganization] = useState<string>(ALL);
  const [trialType, setTrialType] = useState<string>(ALL);
  const [selected, setSelected] = useState<ClassTemplate | null>(null);

  const visibleTemplates = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return templates.filter(template => {
      if (organization !== ALL && template.organization !== organization) return false;
      if (trialType !== ALL && template.trialType !== trialType) return false;
      if (!term) return true;
      return (
        template.templateName.toLowerCase().includes(term) ||
        String(template.organization).toLowerCase().includes(term)
      );
    });
  }, [templates, searchTerm, organization, trialType]);

  const hasFilters = searchTerm !== '' || organization !== ALL || trialType !== ALL;

  const clearFilters = () => {
    setSearchTerm('');
    setOrganization(ALL);
    setTrialType(ALL);
  };

  if (selected) {
    return (
      <div className="myk9-template-page">
        <div className="myk9-template-container">
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)} className="mb-4">
            <X className="mr-2 h-4 w-4" />
            Back to all sport rules
          </Button>
          <SportRulesDetail template={selected} />
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
            This view is read-only. Sport rules are reference data — a change affects every future
            show, so they are edited by reviewed database migration rather than in the app. Use this
            page to confirm what a migration actually seeded.
          </p>
        </div>

        {error && (
          <div className="myk9-filter-section flex items-center justify-between" role="alert">
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={clearError}>
              Dismiss
            </Button>
          </div>
        )}

        <div className="myk9-filter-section">
          <h2 className="myk9-filter-title">Filters</h2>
          <div className="myk9-filter-grid">
            <Input
              className="myk9-filter-input"
              placeholder="Search by name or registry"
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
                {Object.values(Organization).map(org => (
                  <SelectItem key={org} value={org}>
                    {org}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={trialType} onValueChange={setTrialType}>
              <SelectTrigger aria-label="Filter by sport">
                <SelectValue placeholder="All sports" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All sports</SelectItem>
                {Object.values(TrialType).map(type => (
                  <SelectItem key={type} value={type}>
                    {String(type).replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </div>

        <div className="myk9-templates-section">
          {isLoading ? (
            <div role="status" aria-label="Loading sport rules">
              <CardGridSkeleton items={6} />
            </div>
          ) : (
            <div className="myk9-templates-grid">
              {visibleTemplates.map(template => (
                <button
                  key={template.id}
                  type="button"
                  className="myk9-template-card text-left"
                  onClick={() => setSelected(template)}
                  aria-label={`View rules for ${template.templateName}`}
                >
                  <div className="myk9-template-card-header">
                    <div className="myk9-template-card-icon">
                      <FileText className="h-6 w-6" />
                    </div>
                  </div>

                  <div className="myk9-template-card-content">
                    <h3 className="myk9-template-card-title">{template.templateName}</h3>
                    <p className="myk9-template-card-organization">{template.organization}</p>
                    <p className="myk9-template-card-showtype">
                      {String(template.trialType).replace(/_/g, ' ')}
                    </p>

                    <div className="myk9-template-card-meta">
                      <span className="myk9-template-card-version">v{template.version}</span>
                      <span className="myk9-template-card-date">
                        {template.updatedAt
                          ? new Date(template.updatedAt).toLocaleDateString()
                          : 'No date'}
                      </span>
                    </div>

                    <div className="myk9-template-card-badges">
                      <span
                        className={`myk9-template-badge ${template.isActive ? 'active' : 'inactive'}`}
                      >
                        {template.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </button>
              ))}

              {visibleTemplates.length === 0 && (
                <div className="myk9-template-empty">
                  <h3 className="myk9-template-empty-title">No sport rules match those filters</h3>
                  <p className="myk9-template-empty-description">
                    {hasFilters
                      ? 'Clear the filters to see every seeded registry.'
                      : 'Nothing is seeded yet. Sport rules arrive via database migration.'}
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
