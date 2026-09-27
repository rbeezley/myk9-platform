/**
 * Whether the "Quick Registration Setup" shell dialog should be visible.
 *
 * MYK9-832 #4: Create Exhibitor and Add Dog are each their own dialog, opened
 * ON TOP of this shell. While either is open the shell has no content of its
 * own to show through it — it only added a second, dimmed dialog stacked
 * behind the one the secretary is actually using. Hiding it for that span
 * leaves exactly the dialog in use, never more than one at a time.
 */
export function shouldShowQuickCreateShell(
  open: boolean,
  showExhibitorDialog: boolean,
  showDogDialog: boolean
): boolean {
  return open && !showExhibitorDialog && !showDogDialog;
}
