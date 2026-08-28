export const SECRETARY_ENTRIES_READ_ERROR = "We couldn't load entries for this show. Please retry.";

/**
 * Shown when the show itself could not be resolved — the secretary's show list
 * failed to read, or a deep-linked show id could not be fetched. Distinct from
 * SECRETARY_ENTRIES_READ_ERROR: the entries read never happened, because there
 * is no show to read them for. Saying "no entries" here would state an unknown
 * as a fact about the show.
 */
export const SECRETARY_SHOW_READ_ERROR = "We couldn't open this show. Please retry.";
