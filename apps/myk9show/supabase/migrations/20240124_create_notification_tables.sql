-- Migration: Create notification system tables for FCM integration
-- Description: Creates tables for user preferences, FCM tokens, delivery tracking, and analytics

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: notification_preferences
-- Stores user notification preferences and settings
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fcm_token TEXT,
  enabled BOOLEAN DEFAULT true,
  
  -- Notification type preferences
  types JSONB DEFAULT '{
    "showReminders": true,
    "entryDeadlines": true,
    "resultUpdates": true,
    "scheduleChanges": true,
    "judgeAssignments": true,
    "emergencyAlerts": true,
    "paymentReminders": true,
    "entryConfirmations": true
  }'::jsonb,
  
  -- Timing preferences
  timing JSONB DEFAULT '{
    "showReminderHours": [24, 48],
    "entryDeadlineHours": [24, 48],
    "quietHours": {
      "enabled": false,
      "startTime": "22:00",
      "endTime": "08:00",
      "timezone": "America/New_York"
    }
  }'::jsonb,
  
  -- Delivery preferences
  delivery JSONB DEFAULT '{
    "browser": true,
    "email": false,
    "sms": false
  }'::jsonb,
  
  -- Subscription topics for efficient targeting
  topics TEXT[] DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one record per user
  UNIQUE(user_id)
);

-- Table: fcm_tokens
-- Stores FCM tokens for push notification delivery
CREATE TABLE IF NOT EXISTS fcm_tokens (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  device_type TEXT CHECK (device_type IN ('web', 'android', 'ios')) DEFAULT 'web',
  device_info JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_used TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique token per user and device
  UNIQUE(user_id, token)
);

-- Table: notification_templates
-- Stores notification template configurations
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  template_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('reminder', 'deadline', 'update', 'alert', 'confirmation')),
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  is_active BOOLEAN DEFAULT true,
  default_enabled BOOLEAN DEFAULT true,
  requires_permission BOOLEAN DEFAULT true,
  
  -- Template configuration
  config JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: notification_triggers
-- Defines event-driven notification triggers
CREATE TABLE IF NOT EXISTS notification_triggers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  event_type TEXT NOT NULL, -- 'show.created', 'entry.deadline.approaching', etc.
  template_key TEXT NOT NULL REFERENCES notification_templates(template_key),
  is_active BOOLEAN DEFAULT true,
  
  -- Trigger conditions
  conditions JSONB DEFAULT '{}',
  
  -- Target audience configuration
  target_audience JSONB DEFAULT '{
    "userIds": [],
    "roles": [],
    "topics": [],
    "conditions": {}
  }',
  
  -- Timing configuration
  timing JSONB DEFAULT '{
    "immediate": true,
    "scheduledFor": null,
    "offsetHours": 0
  }',
  
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: notification_queue
-- Queues notifications for delivery
CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  fcm_token TEXT,
  
  -- Notification payload
  payload JSONB NOT NULL,
  template_data JSONB DEFAULT '{}',
  
  -- Delivery scheduling
  scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT CHECK (status IN ('pending', 'processing', 'sent', 'delivered', 'failed', 'cancelled')) DEFAULT 'pending',
  
  -- Retry logic
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  
  -- Error tracking
  error_message TEXT,
  fcm_message_id TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: notification_delivery_log
-- Tracks notification delivery status and analytics
CREATE TABLE IF NOT EXISTS notification_delivery_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  queue_id UUID REFERENCES notification_queue(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  
  -- Delivery status tracking
  status TEXT CHECK (status IN ('sent', 'delivered', 'clicked', 'dismissed', 'failed')) NOT NULL,
  fcm_message_id TEXT,
  
  -- Timestamps for analytics
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  clicked_at TIMESTAMP WITH TIME ZONE,
  dismissed_at TIMESTAMP WITH TIME ZONE,
  
  -- Error information
  error_code TEXT,
  error_message TEXT,
  
  -- Metadata for analytics
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: notification_events
-- Tracks user interactions with notifications for analytics
CREATE TABLE IF NOT EXISTS notification_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('received', 'clicked', 'dismissed', 'action_clicked')),
  
  -- Event payload and context
  payload JSONB DEFAULT '{}',
  context JSONB DEFAULT '{}',
  
  -- Device and session information
  device_info JSONB DEFAULT '{}',
  session_id TEXT,
  
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id ON fcm_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_active ON fcm_tokens(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status);
CREATE INDEX IF NOT EXISTS idx_notification_queue_scheduled ON notification_queue(scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notification_queue_user_id ON notification_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_user_id ON notification_delivery_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_template ON notification_delivery_log(template_key);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_status ON notification_delivery_log(status);
CREATE INDEX IF NOT EXISTS idx_notification_events_user_id ON notification_events(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_events_type ON notification_events(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_events_timestamp ON notification_events(timestamp);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_notification_preferences_updated_at 
  BEFORE UPDATE ON notification_preferences 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_triggers_updated_at 
  BEFORE UPDATE ON notification_triggers 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_templates_updated_at 
  BEFORE UPDATE ON notification_templates 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_queue_updated_at 
  BEFORE UPDATE ON notification_queue 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE fcm_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_delivery_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;

-- Users can only access their own notification data
CREATE POLICY "Users can manage their own notification preferences" ON notification_preferences
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own FCM tokens" ON fcm_tokens
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own notification queue" ON notification_queue
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own delivery logs" ON notification_delivery_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notification events" ON notification_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admin policies for notification management
CREATE POLICY "Admins can manage notification templates" ON notification_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

CREATE POLICY "Admins can manage notification triggers" ON notification_triggers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Service role policies for notification processing
CREATE POLICY "Service can manage notification queue" ON notification_queue
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service can manage delivery logs" ON notification_delivery_log
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Insert default notification templates
INSERT INTO notification_templates (template_key, name, description, category, priority, default_enabled, requires_permission) VALUES
  ('SHOW_REMINDER', 'Show Reminder', 'Reminds exhibitors about upcoming dog shows', 'reminder', 'medium', true, true),
  ('ENTRY_DEADLINE', 'Entry Deadline Warning', 'Warns about approaching entry deadlines', 'deadline', 'high', true, true),
  ('RESULT_UPDATE', 'Competition Results', 'Notifies about competition results and placements', 'update', 'medium', true, true),
  ('SCHEDULE_CHANGE', 'Schedule Change Alert', 'Alerts about important schedule changes', 'alert', 'high', true, true),
  ('JUDGE_ASSIGNMENT', 'Judge Assignment', 'Notifies about judge assignments and changes', 'update', 'medium', true, false),
  ('EMERGENCY_ALERT', 'Emergency Alert', 'Critical alerts requiring immediate attention', 'alert', 'critical', true, true),
  ('PAYMENT_REMINDER', 'Payment Reminder', 'Reminds about pending payments', 'reminder', 'medium', true, false),
  ('ENTRY_CONFIRMATION', 'Entry Confirmation', 'Confirms successful show entries', 'confirmation', 'low', true, false)
ON CONFLICT (template_key) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE notification_preferences IS 'User notification preferences and FCM token storage';
COMMENT ON TABLE fcm_tokens IS 'FCM device tokens for push notification delivery';
COMMENT ON TABLE notification_templates IS 'Notification template configurations';
COMMENT ON TABLE notification_triggers IS 'Event-driven notification trigger definitions';
COMMENT ON TABLE notification_queue IS 'Notification delivery queue';
COMMENT ON TABLE notification_delivery_log IS 'Notification delivery status tracking';
COMMENT ON TABLE notification_events IS 'User interaction events for analytics';

COMMENT ON COLUMN notification_preferences.types IS 'JSON object defining which notification types are enabled';
COMMENT ON COLUMN notification_preferences.timing IS 'JSON object defining notification timing preferences';
COMMENT ON COLUMN notification_preferences.delivery IS 'JSON object defining delivery method preferences';
COMMENT ON COLUMN notification_preferences.topics IS 'Array of FCM topics the user is subscribed to';