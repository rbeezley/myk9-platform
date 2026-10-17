import { findFirstFieldControl } from '@/components/forms';
import type { WizardIssue } from './showCreationWizardValidation';

/**
 * The sentence the page's one live region speaks after a failed Next (MYK9-1240): how many
 * items need attention, then the first error. "First" follows the same rule as focus: the issue
 * whose control comes earliest in the document; with no control mounted, the first issue (it
 * sits in the top banner). `issues` must be non-empty.
 */
export function failedNextAnnouncement(issues: readonly WizardIssue[]): string {
  let first = issues[0];
  let firstControl: HTMLElement | null = null;
  for (const issue of issues) {
    if (issue.field === null) continue;
    const control = findFirstFieldControl([issue.field]);
    if (!control) continue;
    if (
      !firstControl ||
      firstControl.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_PRECEDING
    ) {
      firstControl = control;
      first = issue;
    }
  }
  const count = issues.length;
  return `${count} item${count !== 1 ? 's' : ''} need${count === 1 ? 's' : ''} attention. ${first?.message ?? ''}`;
}
