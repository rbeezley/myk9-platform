-- Create audit_entries table (comprehensive audit trail)
CREATE TABLE IF NOT EXISTS audit_entries (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  
  -- Audit metadata
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID, -- Will reference auth.users in production
  session_id TEXT, -- Browser/app session
  
  -- Action details
  action TEXT NOT NULL, -- create, update, delete, login, logout, etc.
  entity_type TEXT NOT NULL, -- dogs, people, shows, entries, etc.
  entity_id TEXT, -- ID of the affected entity
  
  -- Change tracking
  changes JSONB, -- Before/after values for updates
  old_values JSONB, -- Previous state
  new_values JSONB, -- New state
  
  -- Request context
  ip_address INET,
  user_agent TEXT,
  request_path TEXT,
  request_method TEXT,
  
  -- Additional context
  reason TEXT, -- Why the action was performed
  metadata JSONB, -- Additional structured data
  
  -- Risk assessment
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  sensitive_data BOOLEAN DEFAULT FALSE,
  
  -- Timestamps (denormalized for performance)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create system_alerts table (system monitoring and alerts)
CREATE TABLE IF NOT EXISTS system_alerts (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  
  -- Alert details
  alert_type TEXT NOT NULL CHECK (alert_type IN ('error', 'warning', 'info', 'security', 'performance')),
  source TEXT NOT NULL, -- Component that generated the alert
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- Alert metadata
  metadata JSONB, -- Additional structured alert data
  severity INTEGER DEFAULT 1 CHECK (severity BETWEEN 1 AND 5), -- 1=low, 5=critical
  
  -- Alert context
  entity_type TEXT, -- Related entity type
  entity_id TEXT, -- Related entity ID
  user_id UUID, -- User who caused the alert (if applicable)
  
  -- Alert status
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  -- Alert lifecycle
  expires_at TIMESTAMPTZ, -- When alert should be auto-resolved
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create impersonation_sessions table (admin impersonation tracking)
CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  
  -- Session details
  admin_user_id UUID NOT NULL, -- Admin performing impersonation
  target_user_id UUID NOT NULL, -- User being impersonated
  
  -- Session metadata
  reason TEXT NOT NULL, -- Why impersonation is needed
  session_token TEXT UNIQUE, -- Unique session identifier
  
  -- Session context
  ip_address INET,
  user_agent TEXT,
  started_from TEXT, -- Where impersonation was initiated
  
  -- Session lifecycle
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER, -- Calculated duration
  
  -- Session status
  is_active BOOLEAN DEFAULT TRUE,
  ended_reason TEXT, -- manual, timeout, admin_action, etc.
  
  -- Audit trail
  actions_performed INTEGER DEFAULT 0, -- Count of actions during session
  data_accessed TEXT[], -- Types of data accessed
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Note: notification_delivery_status functionality is already provided by existing notification_delivery_log table
-- Note: notification_triggers table already exists with slightly different schema

-- Skip notification table creation as they already exist

-- Create indexes for audit_entries
CREATE INDEX IF NOT EXISTS audit_entries_timestamp_idx ON audit_entries(timestamp);
CREATE INDEX IF NOT EXISTS audit_entries_user_id_idx ON audit_entries(user_id);
CREATE INDEX IF NOT EXISTS audit_entries_action_idx ON audit_entries(action);
CREATE INDEX IF NOT EXISTS audit_entries_entity_type_idx ON audit_entries(entity_type);
CREATE INDEX IF NOT EXISTS audit_entries_entity_id_idx ON audit_entries(entity_id);
CREATE INDEX IF NOT EXISTS audit_entries_risk_level_idx ON audit_entries(risk_level);
CREATE INDEX IF NOT EXISTS audit_entries_ip_address_idx ON audit_entries(ip_address);

-- Create indexes for system_alerts
CREATE INDEX IF NOT EXISTS system_alerts_alert_type_idx ON system_alerts(alert_type);
CREATE INDEX IF NOT EXISTS system_alerts_severity_idx ON system_alerts(severity);
CREATE INDEX IF NOT EXISTS system_alerts_acknowledged_idx ON system_alerts(acknowledged);
CREATE INDEX IF NOT EXISTS system_alerts_resolved_idx ON system_alerts(resolved);
CREATE INDEX IF NOT EXISTS system_alerts_created_at_idx ON system_alerts(created_at);
CREATE INDEX IF NOT EXISTS system_alerts_expires_at_idx ON system_alerts(expires_at);

-- Create indexes for impersonation_sessions
CREATE INDEX IF NOT EXISTS impersonation_sessions_admin_user_id_idx ON impersonation_sessions(admin_user_id);
CREATE INDEX IF NOT EXISTS impersonation_sessions_target_user_id_idx ON impersonation_sessions(target_user_id);
CREATE INDEX IF NOT EXISTS impersonation_sessions_is_active_idx ON impersonation_sessions(is_active);
CREATE INDEX IF NOT EXISTS impersonation_sessions_started_at_idx ON impersonation_sessions(started_at);

-- Notification table indexes already exist

-- Enable RLS
ALTER TABLE audit_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE impersonation_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view audit entries" ON audit_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view system alerts" ON system_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view impersonation sessions" ON impersonation_sessions FOR SELECT TO authenticated USING (true);

-- Insert sample audit entries
INSERT INTO audit_entries (user_id, action, entity_type, entity_id, changes, ip_address, risk_level) VALUES
(extensions.uuid_generate_v4(), 'create', 'dogs', 'sample-dog-1', '{"name": "New Dog", "breed": "Golden Retriever"}'::jsonb, '192.168.1.1', 'low'),
(extensions.uuid_generate_v4(), 'update', 'entries', 'sample-entry-1', '{"status": {"old": "draft", "new": "submitted"}}'::jsonb, '192.168.1.1', 'medium'),
(extensions.uuid_generate_v4(), 'delete', 'shows', 'sample-show-1', '{"name": "Old Show"}'::jsonb, '192.168.1.100', 'high')
ON CONFLICT DO NOTHING;

-- Insert sample system alerts
INSERT INTO system_alerts (alert_type, source, title, message, severity) VALUES
('warning', 'sync_service', 'Sync Delay Warning', 'Entry synchronization is experiencing delays', 2),
('error', 'payment_processor', 'Payment Processing Error', 'Failed to process payment for entry ID 12345', 4),
('info', 'system_maintenance', 'Scheduled Maintenance', 'System maintenance scheduled for tonight', 1)
ON CONFLICT DO NOTHING;

-- Skip notification trigger sample data as table already exists with different schema