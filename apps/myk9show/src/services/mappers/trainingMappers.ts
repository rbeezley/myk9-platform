// Training journal data mappers - transform between database and application types
import type {
  DbTrainingJournalEntry,
  DbTrainingJournalEntryInsert,
  DbTrainingJournalEntryUpdate,
  DbTrainingMilestone,
  DbTrainingMilestoneInsert,
  DbTrainingMilestoneUpdate,
} from '@/types/database-mappings';
import type {
  TrainingJournalEntry,
  TrainingAssessment,
  TrainingMilestone,
  MilestoneSource,
  TrainingStatistics,
} from '@/types/training';

// ========================================
// VALIDATION HELPERS
// ========================================

const TRAINING_ASSESSMENTS = ['breakthrough', 'solid', 'needs_work', 'regression'] as const;

function isTrainingAssessment(value: string): value is TrainingAssessment {
  return (TRAINING_ASSESSMENTS as readonly string[]).includes(value);
}

const MILESTONE_SOURCES = ['manual', 'auto'] as const;

function isMilestoneSource(value: string): value is MilestoneSource {
  return (MILESTONE_SOURCES as readonly string[]).includes(value);
}

// ========================================
// TRAINING JOURNAL ENTRY MAPPERS
// ========================================

export const mapDbTrainingEntryToApp = (dbEntry: DbTrainingJournalEntry): TrainingJournalEntry => {
  return {
    id: dbEntry.id,
    dog_id: dbEntry.dog_id,
    owner_id: dbEntry.owner_id,
    title: dbEntry.title,
    content: dbEntry.content,
    date: dbEntry.date,
    duration_minutes: dbEntry.duration_minutes,
    location: dbEntry.location,
    sport_tag: dbEntry.sport_tag,
    assessment:
      dbEntry.assessment && isTrainingAssessment(dbEntry.assessment) ? dbEntry.assessment : null,
    linked_result_id: dbEntry.linked_result_id,
    notes: dbEntry.notes,
    goals: dbEntry.goals ?? [],
    created_at: dbEntry.created_at,
    updated_at: dbEntry.updated_at,
  };
};

export const mapAppTrainingEntryToDbInsert = (
  appEntry: Omit<TrainingJournalEntry, 'id' | 'created_at' | 'updated_at'>
): DbTrainingJournalEntryInsert => {
  return {
    dog_id: appEntry.dog_id,
    owner_id: appEntry.owner_id,
    title: appEntry.title,
    content: appEntry.content,
    date: appEntry.date,
    duration_minutes: appEntry.duration_minutes,
    location: appEntry.location,
    sport_tag: appEntry.sport_tag,
    assessment: appEntry.assessment,
    linked_result_id: appEntry.linked_result_id,
    notes: appEntry.notes,
    goals: appEntry.goals.length > 0 ? appEntry.goals : null,
  };
};

export const mapAppTrainingEntryToDbUpdate = (
  appEntry: Partial<TrainingJournalEntry>
): DbTrainingJournalEntryUpdate => {
  const update: DbTrainingJournalEntryUpdate = {};

  if (appEntry.title !== undefined) update.title = appEntry.title;
  if (appEntry.content !== undefined) update.content = appEntry.content;
  if (appEntry.date !== undefined) update.date = appEntry.date;
  if (appEntry.duration_minutes !== undefined) update.duration_minutes = appEntry.duration_minutes;
  if (appEntry.location !== undefined) update.location = appEntry.location;
  if (appEntry.sport_tag !== undefined) update.sport_tag = appEntry.sport_tag;
  if (appEntry.assessment !== undefined) update.assessment = appEntry.assessment;
  if (appEntry.linked_result_id !== undefined) update.linked_result_id = appEntry.linked_result_id;
  if (appEntry.notes !== undefined) update.notes = appEntry.notes;
  if (appEntry.goals !== undefined)
    update.goals = appEntry.goals.length > 0 ? appEntry.goals : null;

  return update;
};

// ========================================
// TRAINING MILESTONE MAPPERS
// ========================================

export const mapDbMilestoneToApp = (dbMilestone: DbTrainingMilestone): TrainingMilestone => {
  return {
    id: dbMilestone.id,
    dog_id: dbMilestone.dog_id,
    owner_id: dbMilestone.owner_id,
    title: dbMilestone.title,
    description: dbMilestone.description,
    date: dbMilestone.date,
    source: isMilestoneSource(dbMilestone.source) ? dbMilestone.source : 'manual',
    linked_title_id: dbMilestone.linked_title_id,
    created_at: dbMilestone.created_at,
    updated_at: dbMilestone.updated_at,
  };
};

export const mapAppMilestoneToDbInsert = (
  appMilestone: Omit<TrainingMilestone, 'id' | 'created_at' | 'updated_at'>
): DbTrainingMilestoneInsert => {
  return {
    dog_id: appMilestone.dog_id,
    owner_id: appMilestone.owner_id,
    title: appMilestone.title,
    description: appMilestone.description,
    date: appMilestone.date,
    source: appMilestone.source,
    linked_title_id: appMilestone.linked_title_id,
  };
};

export const mapAppMilestoneToDbUpdate = (
  appMilestone: Partial<TrainingMilestone>
): DbTrainingMilestoneUpdate => {
  const update: DbTrainingMilestoneUpdate = {};

  if (appMilestone.title !== undefined) update.title = appMilestone.title;
  if (appMilestone.description !== undefined) update.description = appMilestone.description;
  if (appMilestone.date !== undefined) update.date = appMilestone.date;
  if (appMilestone.source !== undefined) update.source = appMilestone.source;
  if (appMilestone.linked_title_id !== undefined)
    update.linked_title_id = appMilestone.linked_title_id;

  return update;
};

// ========================================
// TRAINING STATISTICS
// ========================================

export const calculateTrainingStatistics = (
  entries: TrainingJournalEntry[]
): TrainingStatistics => {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const sessionsThisMonth = entries.filter(e => {
    const d = new Date(e.date);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });

  const totalMinutes = entries.reduce((sum, e) => sum + (e.duration_minutes ?? 0), 0);

  const assessmentBreakdown: Record<TrainingAssessment, number> = {
    breakthrough: 0,
    solid: 0,
    needs_work: 0,
    regression: 0,
  };
  entries.forEach(e => {
    if (e.assessment) assessmentBreakdown[e.assessment]++;
  });

  const sportTags = Array.from(new Set(entries.map(e => e.sport_tag).filter(Boolean))) as string[];

  // Calculate streak
  let streakDays = 0;
  if (entries.length > 0) {
    const sortedDates = entries
      .map(e => e.date)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    const today = new Date().toISOString().split('T')[0];
    const uniqueDates = Array.from(new Set(sortedDates));

    if (uniqueDates[0] === today || uniqueDates[0] === getPreviousDate(today)) {
      streakDays = 1;
      for (let i = 1; i < uniqueDates.length; i++) {
        if (uniqueDates[i] === getPreviousDate(uniqueDates[i - 1])) {
          streakDays++;
        } else {
          break;
        }
      }
    }
  }

  return {
    total_sessions: entries.length,
    total_hours: totalMinutes / 60,
    sessions_this_month: sessionsThisMonth.length,
    average_duration_minutes: entries.length > 0 ? totalMinutes / entries.length : 0,
    assessment_breakdown: assessmentBreakdown,
    sport_tags: sportTags,
    streak_days: streakDays,
  };
};

function getPreviousDate(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
