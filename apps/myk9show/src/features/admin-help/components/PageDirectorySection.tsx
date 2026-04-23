import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getAdminHelpSectionKey } from '@/constants/storageKeys';
import { PageDirectoryRow } from './PageDirectoryRow';
import type { PageEntry } from '../types';

export interface PageDirectorySectionProps {
  /** Stable key used for localStorage persistence, e.g. "site-admin" */
  roleKey: string;
  /** Human-facing label */
  title: string;
  entries: readonly PageEntry[];
  /** Returns the resolved navigation path for an entry, or null if unresolvable */
  resolvePath: (path: string) => string | null;
  loading: boolean;
}

export function PageDirectorySection({
  roleKey,
  title,
  entries,
  resolvePath,
  loading,
}: PageDirectorySectionProps) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(getAdminHelpSectionKey(roleKey)) !== 'closed';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(getAdminHelpSectionKey(roleKey), open ? 'open' : 'closed');
  }, [roleKey, open]);

  const toggle = useCallback(() => setOpen(v => !v), []);

  return (
    <section className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between p-3 text-left"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <h3 className="font-semibold">{title}</h3>
          <Badge variant="secondary">{entries.length}</Badge>
        </div>
      </button>
      {open && (
        <div className="space-y-2 border-t p-3">
          {entries.map(entry => (
            <PageDirectoryRow
              key={entry.path}
              entry={entry}
              resolvedPath={resolvePath(entry.path)}
              loading={loading}
            />
          ))}
        </div>
      )}
    </section>
  );
}
