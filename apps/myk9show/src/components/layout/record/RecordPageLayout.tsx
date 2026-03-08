import { cn } from '@/lib/utils';
import { PropertySection } from './PropertySection';
import { AssociationCard } from './AssociationCard';
import type { RecordPageLayoutProps } from './RecordPageLayout.types';

/**
 * Three-panel layout for record detail pages (CRM-inspired).
 *
 * Desktop (≥1280px): left sidebar (properties) | center (tabs) | right sidebar (associations)
 * Tablet  (768-1279px): properties above tabs, no right sidebar (associations fold into tabs)
 * Mobile  (<768px): single column, properties above tabs
 */
export function RecordPageLayout({
  breadcrumb,
  actions,
  stats,
  hero,
  properties,
  tabs,
  tabsContent,
  associations,
  associationsExtra,
  className,
}: RecordPageLayoutProps) {
  const hasLeftSidebar = properties && properties.length > 0;
  const hasRightSidebar = (associations && associations.length > 0) || associationsExtra;

  return (
    <div className={cn('max-w-[1440px] mx-auto', className)}>
      {/* Top bar: breadcrumb + actions */}
      {(breadcrumb || actions) && (
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex-1">{breadcrumb}</div>
          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </div>
      )}

      {/* Stats row */}
      {stats && <div className="px-6 pb-4">{stats}</div>}

      {/* Hero section (profile card, etc.) */}
      {hero && <div className="px-6 pb-6">{hero}</div>}

      {/* Three-panel body */}
      <div className="flex flex-col xl:flex-row gap-6 px-6 pb-8">
        {/* Left sidebar — properties */}
        {hasLeftSidebar && (
          <aside className="w-full xl:w-[280px] xl:min-w-[280px] xl:flex-shrink-0 space-y-3">
            {properties.map(section => (
              <PropertySection key={section.key} section={section} storagePrefix="myk9:prop" />
            ))}
          </aside>
        )}

        {/* Center panel — tabs */}
        <main className="flex-1 min-w-0">
          {tabsContent}
          {tabs && !tabsContent && (
            <div className="space-y-6">
              {tabs.map(tab => (
                <div key={tab.key}>{tab.content}</div>
              ))}
            </div>
          )}
        </main>

        {/* Right sidebar — associations (hidden below xl, content moves to tabs) */}
        {hasRightSidebar && (
          <aside className="hidden xl:block w-[300px] min-w-[300px] flex-shrink-0 space-y-3">
            {associations?.map(assoc => (
              <AssociationCard key={assoc.key} association={assoc} />
            ))}
            {associationsExtra}
          </aside>
        )}
      </div>
    </div>
  );
}
