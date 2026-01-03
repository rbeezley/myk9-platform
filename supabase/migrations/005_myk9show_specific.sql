-- =============================================================================
-- Migration 005: myK9Show-Specific Tables
-- =============================================================================
-- Tables specific to the myK9Show management app:
-- - Health records (vaccinations, medications, vet visits)
-- - Templates (show and class templates)
-- - Judges management
-- - RBAC (role-based access control)
-- - Payments (Stripe integration)
-- - Notifications
-- =============================================================================

-- =============================================================================
-- HEALTH RECORDS
-- =============================================================================

CREATE TABLE IF NOT EXISTS health_records (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  dog_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('general', 'illness', 'injury', 'surgery', 'checkup')),
  title TEXT NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  vet_name TEXT,
  vet_clinic TEXT,
  attachments TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS health_records_dog_id_idx ON health_records(dog_id);
CREATE INDEX IF NOT EXISTS health_records_date_idx ON health_records(date);

CREATE TABLE IF NOT EXISTS vaccinations (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  dog_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  vaccine_name TEXT NOT NULL,
  date_administered DATE NOT NULL,
  expiration_date DATE,
  lot_number TEXT,
  administered_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vaccinations_dog_id_idx ON vaccinations(dog_id);
CREATE INDEX IF NOT EXISTS vaccinations_expiration_idx ON vaccinations(expiration_date);

CREATE TABLE IF NOT EXISTS medications (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  dog_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  medication_name TEXT NOT NULL,
  dosage TEXT,
  frequency TEXT,
  start_date DATE,
  end_date DATE,
  prescribing_vet TEXT,
  reason TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS medications_dog_id_idx ON medications(dog_id);
CREATE INDEX IF NOT EXISTS medications_active_idx ON medications(is_active);

CREATE TABLE IF NOT EXISTS allergies (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  dog_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  allergen TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('mild', 'moderate', 'severe')),
  reaction TEXT,
  diagnosed_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS allergies_dog_id_idx ON allergies(dog_id);

CREATE TABLE IF NOT EXISTS vet_visits (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  dog_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL,
  vet_name TEXT,
  clinic_name TEXT,
  reason TEXT NOT NULL,
  diagnosis TEXT,
  treatment TEXT,
  follow_up_date DATE,
  cost DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vet_visits_dog_id_idx ON vet_visits(dog_id);

CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  dog_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,  -- Title name (e.g., 'CH', 'MACH', 'SWN')
  organization TEXT,    -- AKC, UKC, etc.
  sport TEXT,
  date_earned DATE,
  certificate_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS achievements_dog_id_idx ON achievements(dog_id);

-- =============================================================================
-- TEMPLATES
-- =============================================================================

CREATE TABLE IF NOT EXISTS show_templates (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  show_type TEXT NOT NULL,
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,

  -- Default settings
  default_pre_entry_fee DECIMAL(10,2),
  default_day_of_show_fee DECIMAL(10,2),
  default_max_entries_per_dog INTEGER,
  default_entry_period_days INTEGER DEFAULT 30,

  -- Template data
  template_data JSONB DEFAULT '{}',

  is_public BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES people(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS show_templates_club_id_idx ON show_templates(club_id);

CREATE TABLE IF NOT EXISTS class_templates (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,

  -- Classification
  level TEXT,
  element TEXT,
  competition_type TEXT,

  -- Configuration
  default_entry_fee DECIMAL(10,2),
  default_max_entries INTEGER,
  default_time_limit_seconds INTEGER,

  -- Template data
  template_data JSONB DEFAULT '{}',

  is_public BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES people(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS template_fields (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  template_type TEXT NOT NULL CHECK (template_type IN ('show', 'class')),
  template_id UUID NOT NULL,
  field_name TEXT NOT NULL,
  field_type TEXT NOT NULL,
  field_label TEXT,
  default_value TEXT,
  is_required BOOLEAN DEFAULT FALSE,
  validation_rules JSONB,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- JUDGES
-- =============================================================================

CREATE TABLE IF NOT EXISTS judge_certifications (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  organization TEXT NOT NULL,  -- AKC, UKC, etc.
  sport TEXT NOT NULL,
  level TEXT,  -- Levels they can judge
  certification_number TEXT,
  certification_date DATE,
  expiration_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS judge_certifications_person_id_idx ON judge_certifications(person_id);
CREATE INDEX IF NOT EXISTS judge_certifications_org_sport_idx ON judge_certifications(organization, sport);

CREATE TABLE IF NOT EXISTS judge_assignments (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  show_id UUID REFERENCES shows(id) ON DELETE CASCADE,
  trial_id UUID REFERENCES trials(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,

  status TEXT DEFAULT 'invited' CHECK (status IN ('invited', 'confirmed', 'declined', 'cancelled')),
  invited_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  fee DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS judge_assignments_person_id_idx ON judge_assignments(person_id);
CREATE INDEX IF NOT EXISTS judge_assignments_show_id_idx ON judge_assignments(show_id);
CREATE INDEX IF NOT EXISTS judge_assignments_class_id_idx ON judge_assignments(class_id);

-- =============================================================================
-- RBAC (Role-Based Access Control)
-- =============================================================================

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions TEXT[] DEFAULT '{}',
  is_system BOOLEAN DEFAULT FALSE,  -- System roles can't be deleted
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,  -- Optional: role scoped to club
  show_id UUID REFERENCES shows(id) ON DELETE CASCADE,  -- Optional: role scoped to show
  granted_by UUID REFERENCES people(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, role_id, club_id, show_id)
);

CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS user_roles_role_id_idx ON user_roles(role_id);

CREATE TABLE IF NOT EXISTS permission_audit_log (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID REFERENCES people(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS permission_audit_log_user_id_idx ON permission_audit_log(user_id);
CREATE INDEX IF NOT EXISTS permission_audit_log_created_at_idx ON permission_audit_log(created_at);

-- =============================================================================
-- PAYMENTS (Stripe)
-- =============================================================================

CREATE TABLE IF NOT EXISTS stripe_customers (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stripe_customers_person_id_idx ON stripe_customers(person_id);
CREATE INDEX IF NOT EXISTS stripe_customers_stripe_id_idx ON stripe_customers(stripe_customer_id);

CREATE TABLE IF NOT EXISTS stripe_orders (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  customer_id UUID REFERENCES stripe_customers(id) ON DELETE SET NULL,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_checkout_session_id TEXT,

  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'cancelled')),

  -- What was purchased
  order_type TEXT,  -- 'entry', 'membership', etc.
  metadata JSONB,

  -- Related records
  show_id UUID REFERENCES shows(id) ON DELETE SET NULL,
  entry_ids UUID[],

  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stripe_orders_customer_id_idx ON stripe_orders(customer_id);
CREATE INDEX IF NOT EXISTS stripe_orders_status_idx ON stripe_orders(status);
CREATE INDEX IF NOT EXISTS stripe_orders_show_id_idx ON stripe_orders(show_id);

CREATE TABLE IF NOT EXISTS stripe_subscriptions (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  customer_id UUID REFERENCES stripe_customers(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_price_id TEXT,
  status TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stripe_subscriptions_customer_id_idx ON stripe_subscriptions(customer_id);

-- =============================================================================
-- NOTIFICATIONS (myK9Show style - FCM tokens)
-- =============================================================================

CREATE TABLE IF NOT EXISTS fcm_tokens (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID REFERENCES people(id) ON DELETE CASCADE,
  auth_user_id UUID,
  token TEXT NOT NULL,
  device_type TEXT,
  device_name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(token)
);

CREATE INDEX IF NOT EXISTS fcm_tokens_user_id_idx ON fcm_tokens(user_id);
CREATE INDEX IF NOT EXISTS fcm_tokens_auth_user_id_idx ON fcm_tokens(auth_user_id);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID REFERENCES people(id) ON DELETE CASCADE,
  auth_user_id UUID,

  -- Notification types
  entry_confirmations BOOLEAN DEFAULT TRUE,
  schedule_changes BOOLEAN DEFAULT TRUE,
  results_available BOOLEAN DEFAULT TRUE,
  upcoming_runs BOOLEAN DEFAULT TRUE,
  payment_receipts BOOLEAN DEFAULT TRUE,
  promotional BOOLEAN DEFAULT FALSE,

  -- Channels
  push_enabled BOOLEAN DEFAULT TRUE,
  email_enabled BOOLEAN DEFAULT TRUE,
  sms_enabled BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID REFERENCES people(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data JSONB,
  channels TEXT[] DEFAULT '{push}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notification_queue_user_id_idx ON notification_queue(user_id);
CREATE INDEX IF NOT EXISTS notification_queue_status_idx ON notification_queue(status);
CREATE INDEX IF NOT EXISTS notification_queue_scheduled_idx ON notification_queue(scheduled_for);

-- =============================================================================
-- OFFLINE SCORING (sync support)
-- =============================================================================

CREATE TABLE IF NOT EXISTS offline_scoring (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  scoring_data JSONB NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  synced BOOLEAN DEFAULT FALSE,
  synced_at TIMESTAMPTZ,
  conflict_detected BOOLEAN DEFAULT FALSE,
  resolution TEXT,

  UNIQUE(entry_id, client_id)
);

CREATE INDEX IF NOT EXISTS offline_scoring_entry_id_idx ON offline_scoring(entry_id);
CREATE INDEX IF NOT EXISTS offline_scoring_synced_idx ON offline_scoring(synced);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  client_data JSONB,
  server_data JSONB,
  resolution TEXT CHECK (resolution IN ('client_wins', 'server_wins', 'merged', 'manual')),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES people(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sync_conflicts_table_record_idx ON sync_conflicts(table_name, record_id);

-- =============================================================================
-- ARMBANDS
-- =============================================================================

CREATE TABLE IF NOT EXISTS armbands (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  trial_id UUID REFERENCES trials(id) ON DELETE CASCADE,
  armband_number TEXT NOT NULL,
  entry_id UUID REFERENCES entries(id) ON DELETE SET NULL,
  dog_id UUID REFERENCES dogs(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(show_id, armband_number)
);

CREATE INDEX IF NOT EXISTS armbands_show_id_idx ON armbands(show_id);
CREATE INDEX IF NOT EXISTS armbands_entry_id_idx ON armbands(entry_id);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE TRIGGER update_health_records_updated_at
  BEFORE UPDATE ON health_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vaccinations_updated_at
  BEFORE UPDATE ON vaccinations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_medications_updated_at
  BEFORE UPDATE ON medications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vet_visits_updated_at
  BEFORE UPDATE ON vet_visits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_show_templates_updated_at
  BEFORE UPDATE ON show_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_class_templates_updated_at
  BEFORE UPDATE ON class_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_judge_certifications_updated_at
  BEFORE UPDATE ON judge_certifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_judge_assignments_updated_at
  BEFORE UPDATE ON judge_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stripe_customers_updated_at
  BEFORE UPDATE ON stripe_customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stripe_orders_updated_at
  BEFORE UPDATE ON stripe_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stripe_subscriptions_updated_at
  BEFORE UPDATE ON stripe_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fcm_tokens_updated_at
  BEFORE UPDATE ON fcm_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- SUCCESS
-- =============================================================================
SELECT 'Migration 005: myK9Show-specific tables created successfully' as status;
