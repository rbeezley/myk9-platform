import { cn } from '@/lib/utils';
import { PropertySection } from './PropertySection';
import type { RecordPageLayoutProps } from './RecordPageLayout.types';

/**
 * Three-panel layout for record detail pages (CRM-inspired).
 *
 * Desktop (≥1280px): left sidebar (properties) | center (tabs)
 * Below 1280px: single column — properties above tabs.
 *
 * The two-panel switch is `xl`, not `lg`, because the properties column is
 * FIXED at 280px. This layout also carried a 300px right sidebar of
 * "associations"; at 1024px the two of them plus their gaps left the centre
 * column ~230px, narrower than the cards inside it, and the Dogs card's header
 * row overflowed. That sidebar has since been removed outright — its only ever
 * caller was the person page's Dogs card, whose count now renders beside the
 * Dogs list it counts.
 */
export function RecordPageLayout({
  breadcrumb,
  actions,
  banner,
  stats,
  hero,
  properties,
  tabs,
  tabsContent,
  storageKey = 'myk9:prop',
  className,
}: RecordPageLayoutProps) {
  const hasLeftSidebar = properties && properties.length > 0;

  return (
    <div className={cn('max-w-[1440px] mx-auto', className)}>
      {/* Top bar: breadcrumb + actions */}
      {(breadcrumb || actions) && (
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex-1">{breadcrumb}</div>
          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </div>
      )}

      {/* Lifecycle banner — above stats and hero, never below them */}
      {banner && <div className="px-6 pb-4">{banner}</div>}

      {/* Stats row */}
      {stats && <div className="px-6 pb-4">{stats}</div>}

      {/* Hero section (profile card, etc.) */}
      {hero && <div className="px-6 pb-6">{hero}</div>}

      {/* Two-panel body */}
      <div className="flex flex-col xl:flex-row gap-6 px-6 pb-8">
        {/* Left sidebar — properties */}
        {hasLeftSidebar && (
          <aside className="w-full xl:w-[280px] xl:min-w-[280px] xl:flex-shrink-0 space-y-3">
            {properties.map(section => (
              <PropertySection key={section.key} section={section} storagePrefix={storageKey} />
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
      </div>
    </div>
  );
}
