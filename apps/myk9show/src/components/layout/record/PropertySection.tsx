import { useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InlineEditableField } from '@/components/common/InlineEditableField';
import type { PropertySectionConfig } from './RecordPageLayout.types';

interface PropertySectionProps {
  section: PropertySectionConfig;
  /** Persisted collapse state key prefix. */
  storagePrefix?: string;
}

export function PropertySection({ section, storagePrefix }: PropertySectionProps) {
  const storageKey = storagePrefix ? `${storagePrefix}:${section.key}` : undefined;

  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    if (!storageKey) return true;
    try {
      const saved = localStorage.getItem(storageKey);
      return saved !== 'false';
    } catch {
      return true;
    }
  });

  const toggle = useCallback(() => {
    setIsExpanded(prev => {
      const next = !prev;
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, String(next));
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  }, [storageKey]);

  const Icon = section.icon;

  return (
    <div className="rounded-xl border border-border/50 bg-card/95 overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center justify-between w-full p-3 cursor-pointer hover:bg-muted/30 transition-colors"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          {Icon && (
            <div
              className={cn(
                'p-1.5 rounded-lg',
                section.iconGradient ? `bg-gradient-to-br ${section.iconGradient}` : 'bg-primary/10'
              )}
            >
              <Icon className={cn('h-3.5 w-3.5', section.iconColor || 'text-primary')} />
            </div>
          )}
          <span className="text-sm font-semibold">{section.title}</span>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {isExpanded && (
        <div className="divide-y divide-border/30">
          {section.fields.map(field => (
            <div key={field.label} className="flex items-center justify-between py-2.5 px-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider w-2/5">
                {field.label}
              </span>
              <div className="text-sm font-medium text-foreground text-right w-3/5">
                {field.render ??
                  (field.onSave ? (
                    <InlineEditableField
                      value={field.value}
                      label={field.label}
                      fieldType={field.fieldType}
                      options={field.options}
                      suffix={field.suffix}
                      onSave={field.onSave}
                    />
                  ) : field.value != null && field.value !== '' ? (
                    <>
                      {String(field.value)}
                      {field.suffix}
                    </>
                  ) : (
                    <span className="text-muted-foreground/50 italic font-normal">Not set</span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
