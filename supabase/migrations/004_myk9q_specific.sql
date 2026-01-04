-- =============================================================================
-- Migration 004: myK9Q-Specific Tables
-- =============================================================================
-- Tables specific to the myK9Q scoring app:
-- - Nationals scoring system
-- - Volunteer scheduling
-- - Announcements
-- - Push notifications
-- - Rules assistant
-- - Result visibility controls
-- =============================================================================

-- =============================================================================
-- ENABLE REQUIRED EXTENSIONS
-- =============================================================================
-- pgvector for semantic search embeddings in rules table
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- =============================================================================
-- NATIONALS SCORING TABLES
-- =============================================================================

-- Individual element scores for nationals
CREATE TABLE IF NOT EXISTS nationals_scores (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,

  -- Element info
  element_type TEXT NOT NULL,  -- 'container', 'interior', 'exterior', 'buried', 'handler_discrimination'
  competition_day INTEGER NOT NULL CHECK (competition_day BETWEEN 1 AND 3),

  -- Scoring
  correct_finds INTEGER DEFAULT 0,
  incorrect_finds INTEGER DEFAULT 0,
  faults INTEGER DEFAULT 0,
  no_finish_count INTEGER DEFAULT 0,
  time_seconds NUMERIC DEFAULT 0,
  points INTEGER DEFAULT 0,

  -- Status
  is_scored BOOLEAN DEFAULT FALSE,
  result_status TEXT DEFAULT 'pending',

  -- Multi-tenant
  license_key TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint
  UNIQUE(entry_id, element_type, competition_day)
);

CREATE INDEX IF NOT EXISTS nationals_scores_entry_id_idx ON nationals_scores(entry_id);
CREATE INDEX IF NOT EXISTS nationals_scores_license_key_idx ON nationals_scores(license_key);

-- Cumulative rankings across elements
CREATE TABLE IF NOT EXISTS nationals_rankings (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,

  -- Cumulative scores
  total_points INTEGER DEFAULT 0,
  total_time_seconds NUMERIC DEFAULT 0,
  elements_completed INTEGER DEFAULT 0,

  -- Ranking
  current_rank INTEGER,
  previous_rank INTEGER,

  -- Status
  is_eliminated BOOLEAN DEFAULT FALSE,
  elimination_reason TEXT,

  -- Multi-tenant
  license_key TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(entry_id)
);

CREATE INDEX IF NOT EXISTS nationals_rankings_license_key_idx ON nationals_rankings(license_key);
CREATE INDEX IF NOT EXISTS nationals_rankings_current_rank_idx ON nationals_rankings(current_rank);

-- Advancement tracking between competition days
CREATE TABLE IF NOT EXISTS nationals_advancement (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,

  from_day INTEGER NOT NULL,
  to_day INTEGER NOT NULL,
  advanced BOOLEAN DEFAULT FALSE,
  advancement_rank INTEGER,

  -- Multi-tenant
  license_key TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nationals_advancement_entry_id_idx ON nationals_advancement(entry_id);

-- =============================================================================
-- VOLUNTEER SCHEDULING
-- =============================================================================

CREATE TABLE IF NOT EXISTS volunteer_roles (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  requires_training BOOLEAN DEFAULT FALSE,
  max_volunteers INTEGER,
  license_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS volunteers (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  person_id UUID REFERENCES people(id) ON DELETE CASCADE,
  name TEXT NOT NULL,  -- Denormalized
  email TEXT,
  phone TEXT,
  is_available BOOLEAN DEFAULT TRUE,
  notes TEXT,
  license_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS volunteers_person_id_idx ON volunteers(person_id);
CREATE INDEX IF NOT EXISTS volunteers_license_key_idx ON volunteers(license_key);

CREATE TABLE IF NOT EXISTS volunteer_class_assignments (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  volunteer_id UUID NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  role_id UUID REFERENCES volunteer_roles(id) ON DELETE SET NULL,
  role_name TEXT,  -- Denormalized
  status TEXT DEFAULT 'assigned' CHECK (status IN ('assigned', 'confirmed', 'checked_in', 'completed', 'no_show')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(volunteer_id, class_id, role_id)
);

CREATE INDEX IF NOT EXISTS volunteer_class_assignments_class_id_idx ON volunteer_class_assignments(class_id);

CREATE TABLE IF NOT EXISTS volunteer_general_assignments (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  volunteer_id UUID NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  trial_id UUID REFERENCES trials(id) ON DELETE CASCADE,
  show_id UUID REFERENCES shows(id) ON DELETE CASCADE,
  role_id UUID REFERENCES volunteer_roles(id) ON DELETE SET NULL,
  role_name TEXT,
  shift_start TIME,
  shift_end TIME,
  status TEXT DEFAULT 'assigned',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- ANNOUNCEMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  show_id UUID REFERENCES shows(id) ON DELETE CASCADE,
  trial_id UUID REFERENCES trials(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'warning', 'alert', 'schedule_change')),

  -- Visibility
  is_published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  -- Targeting
  target_audience TEXT[] DEFAULT '{}',  -- 'all', 'exhibitors', 'judges', 'volunteers'

  -- Multi-tenant
  license_key TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS announcements_show_id_idx ON announcements(show_id);
CREATE INDEX IF NOT EXISTS announcements_license_key_idx ON announcements(license_key);

CREATE TABLE IF NOT EXISTS announcement_reads (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id UUID,
  read_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(announcement_id, user_id)
);

-- =============================================================================
-- PUSH NOTIFICATIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID,
  endpoint TEXT NOT NULL,
  p256dh TEXT,
  auth TEXT,
  license_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_license_key_idx ON push_subscriptions(license_key);

CREATE TABLE IF NOT EXISTS push_notification_queue (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  subscription_id UUID REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  data JSONB,
  priority TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'expired')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS push_notification_queue_status_idx ON push_notification_queue(status);
CREATE INDEX IF NOT EXISTS push_notification_queue_scheduled_idx ON push_notification_queue(scheduled_for);

-- =============================================================================
-- RULES ASSISTANT
-- =============================================================================

CREATE TABLE IF NOT EXISTS rule_organizations (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,  -- 'AKC', 'UKC', 'ASCA'
  name TEXT NOT NULL,
  website TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rule_sports (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  code TEXT NOT NULL,  -- 'scent_work', 'rally', 'obedience'
  name TEXT NOT NULL,
  organization_id UUID REFERENCES rule_organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, code)
);

CREATE TABLE IF NOT EXISTS rulebooks (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  organization_id UUID REFERENCES rule_organizations(id) ON DELETE CASCADE,
  sport_id UUID REFERENCES rule_sports(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  version TEXT,
  effective_date DATE,
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rules (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  rulebook_id UUID REFERENCES rulebooks(id) ON DELETE CASCADE,
  section TEXT,
  rule_number TEXT,
  title TEXT,
  content TEXT NOT NULL,
  keywords TEXT[],
  embedding extensions.vector(1536),  -- For semantic search
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rules_rulebook_id_idx ON rules(rulebook_id);
CREATE INDEX IF NOT EXISTS rules_keywords_idx ON rules USING GIN(keywords);

CREATE TABLE IF NOT EXISTS rules_query_log (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  query TEXT NOT NULL,
  results_count INTEGER,
  response_time_ms INTEGER,
  user_id UUID,
  license_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rules_feedback (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  query_log_id UUID REFERENCES rules_query_log(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES rules(id) ON DELETE CASCADE,
  helpful BOOLEAN,
  feedback_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- RESULT VISIBILITY CONTROLS
-- =============================================================================

CREATE TABLE IF NOT EXISTS show_result_visibility_defaults (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  default_visibility TEXT DEFAULT 'all' CHECK (default_visibility IN ('all', 'handlers_only', 'hidden')),
  auto_release_delay_minutes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(show_id)
);

CREATE TABLE IF NOT EXISTS trial_result_visibility_overrides (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  trial_id UUID NOT NULL REFERENCES trials(id) ON DELETE CASCADE,
  visibility TEXT CHECK (visibility IN ('all', 'handlers_only', 'hidden')),
  release_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(trial_id)
);

CREATE TABLE IF NOT EXISTS class_result_visibility_overrides (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  visibility TEXT CHECK (visibility IN ('all', 'handlers_only', 'hidden')),
  release_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(class_id)
);

-- =============================================================================
-- PERFORMANCE METRICS
-- =============================================================================

CREATE TABLE IF NOT EXISTS performance_metrics (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  metric_type TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC,
  metadata JSONB,
  license_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS performance_metrics_type_idx ON performance_metrics(metric_type);
CREATE INDEX IF NOT EXISTS performance_metrics_created_idx ON performance_metrics(created_at);

-- =============================================================================
-- USER PREFERENCES (app-specific settings)
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID,
  auth_user_id UUID,
  app TEXT NOT NULL CHECK (app IN ('myk9q', 'myk9show', 'shared')),
  preferences JSONB DEFAULT '{}',
  license_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, app)
);

CREATE INDEX IF NOT EXISTS user_preferences_auth_user_id_idx ON user_preferences(auth_user_id);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE TRIGGER update_nationals_scores_updated_at
  BEFORE UPDATE ON nationals_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_nationals_rankings_updated_at
  BEFORE UPDATE ON nationals_rankings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_volunteers_updated_at
  BEFORE UPDATE ON volunteers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_announcements_updated_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- SUCCESS
-- =============================================================================
SELECT 'Migration 004: myK9Q-specific tables created successfully' as status;
