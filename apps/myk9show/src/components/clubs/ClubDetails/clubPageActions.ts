import type { PageExtraAction } from '@/features/actions/pageEditTarget';

export interface ClubPageActionInput {
  /** May create a show for THIS club (`canOpenCreateShowWizard` and a staff grant on it). */
  canAddShow: boolean;
  canEditBranding: boolean;
  /** MYK9-572: site admin only, mirroring set_club_authorization's is_site_admin(). */
  canAuthorizeClub: boolean;
  /** Undefined while the authorization read is in flight. */
  isClubAuthorized: boolean | undefined;
  isAuthorizationLoading: boolean;
  isAuthorizationUpdating: boolean;
  onEditPhoto: () => void;
  /** The show wizard, opened with this club already chosen. */
  onAddShow: () => void;
  onAuthorize: () => void;
  /** Opens the confirm dialog; revoking never fires straight from the menu (P3-C). */
  onRequestRevoke: () => void;
}

/**
 * The club page's actions beyond Edit, for the header Actions menu (CRUD standard decision 6),
 * with the gates of the hero ⋮ and the toolbar Add Show button they replace. Authorize/Revoke waits for the authorization read,
 * so it never offers the wrong one of the pair, and greys with a reason while a change saves.
 * The card's Email / Call / Website items are gone: About shows them as links.
 */
export function buildClubPageActions(input: ClubPageActionInput): PageExtraAction[] {
  const actions: PageExtraAction[] = [];
  if (input.canAddShow) {
    actions.push({
      id: 'add-show',
      label: 'Add Show for this club',
      icon: 'add-show',
      run: input.onAddShow,
    });
  }
  if (input.canEditBranding) {
    actions.push({ id: 'photo', label: 'Change Photo', icon: 'photo', run: input.onEditPhoto });
  }
  if (input.canAuthorizeClub && !input.isAuthorizationLoading) {
    const disabledReason = input.isAuthorizationUpdating ? 'Saving…' : undefined;
    actions.push(
      input.isClubAuthorized
        ? {
            id: 'revoke-authorization',
            label: 'Revoke Authorization',
            icon: 'revoke',
            disabledReason,
            run: input.onRequestRevoke,
          }
        : {
            id: 'authorize',
            label: 'Authorize Club',
            icon: 'authorize',
            disabledReason,
            run: input.onAuthorize,
          }
    );
  }
  return actions;
}
