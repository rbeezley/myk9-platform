import React, { useMemo } from 'react';
import { EyeOff, Eye } from 'lucide-react';
import { useRememberedTab } from '@/hooks/useRememberedTab';

export interface FieldDefinition {
  label: string;
  /** Raw value used to determine if the field is "empty". */
  value: string | number | null | undefined;
  /** Custom render for the value cell. Falls back to displaying `value`. */
  render?: React.ReactNode;
}

interface FilterableFieldGridProps {
  /** Unique key for persisting toggle state in localStorage. */
  sectionKey: string;
  fields: FieldDefinition[];
  /** Grid columns on desktop. Default 2. */
  columns?: 2 | 3 | 4;
}

const colsClass: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'sm:grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-4',
};

function isEmpty(value: string | number | null | undefined): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '' || value === 'N/A';
  return false;
}

/**
 * A responsive field grid with a "Hide empty" toggle.
 * Empty fields (null, undefined, empty string, "N/A") are hidden when toggled on.
 * Toggle state persists in localStorage per `sectionKey`.
 */
export const FilterableFieldGrid: React.FC<FilterableFieldGridProps> = ({
  sectionKey,
  fields,
  columns = 2,
}) => {
  // Reuse remembered-tab hook for simple string persistence ("show" | "hide")
  const [hideEmpty, setHideEmpty] = useRememberedTab(`fields:${sectionKey}`, 'show');
  const isHiding = hideEmpty === 'hide';

  const { visible, filledCount, totalCount } = useMemo(() => {
    const filled = fields.filter(f => !isEmpty(f.value));
    return {
      visible: isHiding ? filled : fields,
      filledCount: filled.length,
      totalCount: fields.length,
    };
  }, [fields, isHiding]);

  const hasEmptyFields = filledCount < totalCount;

  return (
    <div>
      {/* Toggle row — only shown when there are empty fields */}
      {hasEmptyFields && (
        <div className="flex items-center justify-end mb-3">
          <button
            type="button"
            onClick={() => setHideEmpty(isHiding ? 'show' : 'hide')}
            className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors duration-200"
          >
            {isHiding ? (
              <>
                <Eye className="w-3.5 h-3.5" />
                Showing {filledCount} of {totalCount}
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                Hide empty
              </>
            )}
          </button>
        </div>
      )}

      <div className={`grid ${colsClass[columns]} gap-x-8 gap-y-5`}>
        {visible.map(field => (
          <div key={field.label} className="flex flex-col pb-3 border-b border-border/30">
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-1">
              {field.label}
            </span>
            {field.render ?? (
              <span className="text-sm font-medium text-foreground">
                {isEmpty(field.value) ? 'Not provided' : String(field.value)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
