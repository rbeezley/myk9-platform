/**
 * Plain words for offline and app-update messages (MYK9-1818). The word list lives in
 * docs/reference/ui-vocabulary.md, "Offline and updates". Only sentences that appear in more
 * than one file are held here; one-off sentences stay next to the code that shows them.
 */

/** The button and menu label for getting the newest version of the app. */
export const UPDATE_THE_APP_LABEL = 'Update the app';

/** Tail of every "saved offline" sentence: where the change is and when it leaves. */
export const SENT_WHEN_ONLINE = 'will be sent when you are back online';

/** Shown to a person on this device while offline, and by the offline toast. */
export const OFFLINE_SAVED_MESSAGE = `You're offline. Changes are saved on this device and ${SENT_WHEN_ONLINE}.`;
