/**
 * MYK9-1685 "This show uses…" switches: replica field -> shows column. All five columns are
 * NOT NULL, so an unset replica field is omitted (never sent as null) and the row keeps its value.
 */
export const SHOW_USES_FIELD_COLUMNS = [
  ['usesDeviceScoring', 'uses_device_scoring'],
  ['usesPaperPacket', 'uses_paper_packet'],
  ['usesVolunteers', 'uses_volunteers'],
  ['usesLandingPage', 'uses_landing_page'],
  ['publishesOwnPremium', 'publishes_own_premium'],
] as const;

type ShowUsesField = (typeof SHOW_USES_FIELD_COLUMNS)[number][0];

export function showUsesColumns(
  show: Partial<Record<ShowUsesField, boolean | undefined>>
): Record<string, boolean> {
  const columns: Record<string, boolean> = {};
  for (const [field, column] of SHOW_USES_FIELD_COLUMNS) {
    const value = show[field];
    if (value !== undefined) columns[column] = value;
  }
  return columns;
}

type ShowUsesValues = Partial<Record<ShowUsesField, boolean | undefined>>;

/** Replica fields from a `shows` row (nullable/absent columns read as unset). */
export function showUsesFromRow(row: {
  uses_device_scoring?: boolean | null;
  uses_paper_packet?: boolean | null;
  uses_volunteers?: boolean | null;
  uses_landing_page?: boolean | null;
  publishes_own_premium?: boolean | null;
}): ShowUsesValues {
  return {
    usesDeviceScoring: row.uses_device_scoring ?? undefined,
    usesPaperPacket: row.uses_paper_packet ?? undefined,
    usesVolunteers: row.uses_volunteers ?? undefined,
    usesLandingPage: row.uses_landing_page ?? undefined,
    publishesOwnPremium: row.publishes_own_premium ?? undefined,
  };
}

/** Only the switch fields an update actually sets (undefined means "leave it"). */
export function pickShowUsesUpdates(updates: ShowUsesValues): ShowUsesValues {
  const picked: ShowUsesValues = {};
  for (const [field] of SHOW_USES_FIELD_COLUMNS) {
    if (updates[field] !== undefined) picked[field] = updates[field];
  }
  return picked;
}

/** What a show uses before anyone touches a switch (matches the migration's column defaults). */
const SHOW_USES_DEFAULTS = {
  usesDeviceScoring: true,
  usesPaperPacket: false,
  usesVolunteers: false,
  usesLandingPage: false,
  publishesOwnPremium: false,
} as const;

/** A locally created show carries the defaults, so it reads the same offline as after sync. */
export function withShowUsesDefaults<T extends ShowUsesValues>(show: T): T {
  const filled: ShowUsesValues = { ...SHOW_USES_DEFAULTS };
  Object.assign(filled, pickShowUsesUpdates(show));
  return { ...show, ...filled };
}
