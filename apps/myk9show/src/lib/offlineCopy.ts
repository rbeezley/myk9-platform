/**
 * Plain words for offline and app-update messages (MYK9-1818). The word list lives in
 * docs/reference/ui-vocabulary.md, "Offline and updates". Only sentences that appear in more
 * than one file are held here; one-off sentences stay next to the code that shows them.
 */

/** The button and menu label for getting the newest version of the app. */
export const UPDATE_THE_APP_LABEL = 'Update the app';

/** The button for starting the app again when nothing new is being applied (never "update"). */
export const RESTART_THE_APP_LABEL = 'Restart the app';

/** Plain words for server trouble: the person cannot fix it, so say what happened. */
export const COULD_NOT_REACH_MYK9SHOW = 'We could not reach myK9Show.';

/** Tail of every "saved offline" sentence: where the change is and when it leaves. */
export const SENT_WHEN_ONLINE = 'will be sent when you are back online';

/** Shown to a person on this device while offline, and by the offline toast. */
export const OFFLINE_SAVED_MESSAGE = `You're offline. Changes are saved on this device and ${SENT_WHEN_ONLINE}.`;

/** The conflict toast (ReplicationSyncProvider) and the Verify blocked reason name the same buttons. */
export const CONFLICT_TOAST_TITLE = 'This was changed somewhere else at the same time';
export const CONFLICT_TOAST_DESCRIPTION =
  'Choose which change to keep. The other one is thrown away.';
export const CONFLICT_TAKE_REMOTE_LABEL = 'Keep the other change';
export const CONFLICT_KEEP_LOCAL_LABEL = 'Keep my change';
/** The button beside the Verify blocked reason that raises the closed conflict notice again. */
export const CONFLICT_REOPEN_LABEL = 'Show the choice again';
