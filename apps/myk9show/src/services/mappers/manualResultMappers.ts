// Manual results data mappers - transform between database and application types
import type {
  DbManualResult,
  DbManualResultInsert,
  DbManualResultUpdate,
} from '@/types/database-mappings';
import type { ManualResult, ManualResultStatus } from '@/types/manual-result-types';

const MANUAL_RESULT_STATUSES = ['qualified', 'nq', 'absent', 'excused', 'withdrawn'] as const;

function isManualResultStatus(value: string): value is ManualResultStatus {
  return (MANUAL_RESULT_STATUSES as readonly string[]).includes(value);
}

export const mapDbManualResultToApp = (db: DbManualResult): ManualResult => {
  return {
    id: db.id,
    dog_id: db.dog_id,
    owner_id: db.owner_id,
    organization: db.organization,
    sport_template_id: db.sport_template_id,
    show_name: db.show_name,
    trial_date: db.trial_date,
    judge: db.judge,
    location: db.location,
    element: db.element,
    level: db.level,
    section: db.section,
    result_status: isManualResultStatus(db.result_status) ? db.result_status : 'qualified',
    search_time_seconds: db.search_time_seconds != null ? Number(db.search_time_seconds) : null,
    placement: db.placement,
    points_earned: db.points_earned ?? 0,
    notes: db.notes,
    source: db.source,
    created_at: db.created_at,
    updated_at: db.updated_at,
  };
};

export const mapAppManualResultToDbInsert = (
  app: Omit<ManualResult, 'id' | 'created_at' | 'updated_at'>
): DbManualResultInsert => {
  return {
    dog_id: app.dog_id,
    owner_id: app.owner_id,
    organization: app.organization,
    sport_template_id: app.sport_template_id,
    show_name: app.show_name,
    trial_date: app.trial_date,
    judge: app.judge,
    location: app.location,
    element: app.element,
    level: app.level,
    section: app.section,
    result_status: app.result_status,
    search_time_seconds: app.search_time_seconds,
    placement: app.placement,
    points_earned: app.points_earned,
    notes: app.notes,
    source: app.source,
  };
};

export const mapAppManualResultToDbUpdate = (app: Partial<ManualResult>): DbManualResultUpdate => {
  const update: DbManualResultUpdate = {};

  if (app.organization !== undefined) update.organization = app.organization;
  if (app.sport_template_id !== undefined) update.sport_template_id = app.sport_template_id;
  if (app.show_name !== undefined) update.show_name = app.show_name;
  if (app.trial_date !== undefined) update.trial_date = app.trial_date;
  if (app.judge !== undefined) update.judge = app.judge;
  if (app.location !== undefined) update.location = app.location;
  if (app.element !== undefined) update.element = app.element;
  if (app.level !== undefined) update.level = app.level;
  if (app.section !== undefined) update.section = app.section;
  if (app.result_status !== undefined) update.result_status = app.result_status;
  if (app.search_time_seconds !== undefined) update.search_time_seconds = app.search_time_seconds;
  if (app.placement !== undefined) update.placement = app.placement;
  if (app.points_earned !== undefined) update.points_earned = app.points_earned;
  if (app.notes !== undefined) update.notes = app.notes;
  if (app.source !== undefined) update.source = app.source;

  return update;
};
