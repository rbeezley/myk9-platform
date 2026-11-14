/**
 * The reports a before-trial packet holds for each class, in print order. Kept apart from the
 * PDF builder so the show desk can name them without loading pdf-lib (the bundle budget).
 */
export const PACKET_REPORT_IDS = ['check-in-sheet', 'scoresheet'] as const;
