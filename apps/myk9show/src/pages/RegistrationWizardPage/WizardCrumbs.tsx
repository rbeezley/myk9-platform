import { Link } from 'react-router-dom';
import { CRUMB_TOUCH_TARGET, type AncestorCrumb } from '@/components/common/breadcrumbCrumb';

interface WizardCrumbsProps {
  /** The show in the route. Known before the show's name has loaded. */
  showId: string | undefined;
  showName: string | undefined;
  /** What this wizard is doing, e.g. "Add entry": the current page. */
  workflowLabel: string;
}

const LINK_CLASS = `${CRUMB_TOUCH_TARGET} rounded-sm underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`;

/**
 * "Shows / <show> / Add entry" in the wizard header, with the two ancestors as links
 * (MYK9-2489: all three were plain text).
 *
 * They open in a new tab, like every other link the wizard draws (MYK9-1973,
 * `wizardLinksOpenInNewTab.test.ts`): leaving the wizard in the same tab drops the selected dogs
 * and the current step, so a crumb must never be the way an entry in progress is lost. The Back
 * button stays the wizard's own way out.
 *
 * The look is unchanged. `min-w-0` is load-bearing: without it this flex child cannot shrink
 * below its content, so the truncate on the show name never engages and the row overflows at
 * 375px. Hidden below `sm`: the show name is repeated under the title, and on a phone this row
 * wrapped to three lines (MYK9-622).
 */
export function WizardCrumbs({ showId, showName, workflowLabel }: WizardCrumbsProps) {
  const ancestors: AncestorCrumb[] = [
    { label: 'Shows', href: '/shows' },
    // The route names the show before its name has loaded, so the link is exact from the start.
    { label: showName || 'Show', href: showId ? `/shows/${showId}` : '/shows' },
  ];
  return (
    <nav
      aria-label="Breadcrumb"
      className="hidden min-w-0 items-center gap-2 text-sm text-muted-foreground sm:flex"
    >
      <Link to={ancestors[0].href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
        {ancestors[0].label}
      </Link>
      <span aria-hidden="true">/</span>
      <Link
        to={ancestors[1].href}
        target="_blank"
        rel="noopener noreferrer"
        title={ancestors[1].label}
        className={`max-w-[200px] ${LINK_CLASS}`}
      >
        {/* The truncate sits on the text: the link itself is a flex box for its touch target. */}
        <span className="truncate">{ancestors[1].label}</span>
      </Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page" className="font-medium text-foreground">
        {workflowLabel}
      </span>
    </nav>
  );
}
