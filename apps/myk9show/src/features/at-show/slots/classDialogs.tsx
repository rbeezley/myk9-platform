/**
 * Class-scoped at-show dialog slot shims — every dialog keyed to a single
 * class's options, status, requirements, settings, max-time, or area count.
 * Thin Phase 1a host shims conforming to ringside's dialog prop contracts;
 * the data handlers behind them are spike stubs owned by the host hooks.
 */
import type React from 'react';
import type { ClassSettingsDialogProps } from '@myk9/ringside';
import { Eye, SlidersHorizontal, UserCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import {
  getClassCheckinModeHref,
  getClassResultsVisibilityHref,
  useHasClassSettingsLinks,
} from './classSettingsLinks';
import { ClassDialogShell } from './ClassDialogShell';

// ClassOptionsDialog lives in ./ClassOptionsDialog (MYK9-1502).
export { ClassOptionsDialog } from './ClassOptionsDialog';

// ClassStatusDialog lives in ./ClassStatusDialog (v3 statuses, descriptions and times).
export { ClassStatusDialog } from './ClassStatusDialog';

// ---------------------------------------------------------------------------
// ClassRequirementsDialog — the class's rules; see RequirementsDialog (MYK9-1100).
// ---------------------------------------------------------------------------

export { ClassRequirementsDialog } from './RequirementsDialog';

// ---------------------------------------------------------------------------
// ClassSettingsDialog — per-class settings.
// ---------------------------------------------------------------------------

export const ClassSettingsDialog: React.FC<ClassSettingsDialogProps> = ({
  isOpen,
  onClose,
  classData,
}) => {
  const { showId } = useParams<{ showId: string }>();
  const isOnline = useIsOnline();
  const canOpen = useHasClassSettingsLinks(showId);
  if (!isOpen) return null;

  const links =
    showId && canOpen
      ? [
          {
            title: 'Check-in mode',
            hint: 'Opens Self check-in on the Show Desk',
            icon: UserCheck,
            href: getClassCheckinModeHref(showId, classData.id),
          },
          {
            title: 'Results visibility',
            hint: 'Opens Results visibility on the Results tab',
            icon: Eye,
            href: getClassResultsVisibilityHref(showId, classData.id),
          },
        ]
      : [];

  return (
    <ClassDialogShell
      icon={SlidersHorizontal}
      eyebrow="Class settings"
      className={classData.class_name}
      onClose={onClose}
    >
      {links.length > 0 && (
        <p className="text-sm text-muted-foreground">You will pick this class on the next page.</p>
      )}
      {links.map(({ title, hint, icon: Icon, href }) => {
        const body = (
          <>
            <Icon aria-hidden className="h-5 w-5 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">{title}</span>
              <span className="block text-xs text-muted-foreground">
                {isOnline ? hint : 'Needs a connection. Try again when you are back online.'}
              </span>
            </span>
          </>
        );
        const base =
          'flex min-h-14 w-full items-center gap-3 rounded-lg border bg-card p-3 text-left';
        return isOnline ? (
          <Link
            key={title}
            to={href}
            onClick={onClose}
            className={cn(base, 'hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring')}
          >
            {body}
          </Link>
        ) : (
          <button
            key={title}
            type="button"
            disabled
            aria-disabled
            className={cn(base, 'opacity-60')}
          >
            {body}
          </button>
        );
      })}
    </ClassDialogShell>
  );
};

// MaxTimeDialog lives in ./MaxTimeDialog (it saves through the class replica).
export { MaxTimeDialog } from './MaxTimeDialog';

// AreaCountSelectionDialog lives in ./AreaCountSelectionDialog (it saves through the class replica).
export { AreaCountSelectionDialog } from './AreaCountSelectionDialog';
