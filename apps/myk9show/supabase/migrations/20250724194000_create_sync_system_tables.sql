-- Create sync_queue table (for local-first sync)
CREATE TABLE IF NOT EXISTS sync_queue (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  
  -- Entity information
  entity_type TEXT NOT NULL, -- dogs, people, shows, entries, etc.
  entity_id TEXT NOT NULL, -- ID of the entity being synced
  
  -- Operation details
  operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
  data JSONB, -- The data to be synced
  
  -- Queue management
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  
  -- Retry logic
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  
  -- Error tracking
  last_error TEXT,
  error_details JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Create sync_conflicts table (for conflict resolution)
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  
  -- Entity information
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  
  -- Conflict data
  local_version INTEGER,
  remote_version INTEGER,
  local_data JSONB,
  remote_data JSONB,
  conflict_data JSONB, -- Detailed conflict information
  
  -- Resolution
  resolution_strategy TEXT CHECK (resolution_strategy IN ('local_wins', 'remote_wins', 'merge', 'manual')),
  resolved_data JSONB,
  resolved_by TEXT, -- User who resolved the conflict
  resolved_at TIMESTAMPTZ,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'ignored')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create offline_scoring table (for offline scoring capability)
CREATE TABLE IF NOT EXISTS offline_scoring (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  
  -- Scoring session
  judge_id UUID REFERENCES people(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  show_id UUID REFERENCES shows(id) ON DELETE CASCADE,
  
  -- Scoring data
  scoring_data JSONB NOT NULL, -- Complete scoring session data
  entry_scores JSONB, -- Individual entry scores
  
  -- Session metadata
  session_name TEXT,
  offline_timestamp TIMESTAMPTZ NOT NULL, -- When scoring was done offline
  device_info JSONB, -- Device information
  
  -- Sync status
  synced_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'synced', 'error')),
  sync_error TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for sync_queue
CREATE INDEX IF NOT EXISTS sync_queue_entity_type_idx ON sync_queue(entity_type);
CREATE INDEX IF NOT EXISTS sync_queue_entity_id_idx ON sync_queue(entity_id);
CREATE INDEX IF NOT EXISTS sync_queue_status_idx ON sync_queue(status);
CREATE INDEX IF NOT EXISTS sync_queue_priority_idx ON sync_queue(priority);
CREATE INDEX IF NOT EXISTS sync_queue_next_retry_at_idx ON sync_queue(next_retry_at);
CREATE INDEX IF NOT EXISTS sync_queue_created_at_idx ON sync_queue(created_at);

-- Create indexes for sync_conflicts
CREATE INDEX IF NOT EXISTS sync_conflicts_entity_type_idx ON sync_conflicts(entity_type);
CREATE INDEX IF NOT EXISTS sync_conflicts_entity_id_idx ON sync_conflicts(entity_id);
CREATE INDEX IF NOT EXISTS sync_conflicts_status_idx ON sync_conflicts(status);
CREATE INDEX IF NOT EXISTS sync_conflicts_created_at_idx ON sync_conflicts(created_at);

-- Create indexes for offline_scoring
CREATE INDEX IF NOT EXISTS offline_scoring_judge_id_idx ON offline_scoring(judge_id);
CREATE INDEX IF NOT EXISTS offline_scoring_class_id_idx ON offline_scoring(class_id);
CREATE INDEX IF NOT EXISTS offline_scoring_show_id_idx ON offline_scoring(show_id);
CREATE INDEX IF NOT EXISTS offline_scoring_sync_status_idx ON offline_scoring(sync_status);
CREATE INDEX IF NOT EXISTS offline_scoring_offline_timestamp_idx ON offline_scoring(offline_timestamp);

-- Enable RLS
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_scoring ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view sync queue" ON sync_queue FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view sync conflicts" ON sync_conflicts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view offline scoring" ON offline_scoring FOR SELECT TO authenticated USING (true);

-- Insert sample sync queue entries
INSERT INTO sync_queue (entity_type, entity_id, operation, data, priority, status) VALUES
('dogs', 'sample-dog-1', 'update', '{"name": "Updated Dog Name", "breed": "Golden Retriever"}'::jsonb, 'medium', 'pending'),
('entries', 'sample-entry-1', 'create', '{"dog_id": "sample-dog-1", "class_id": "sample-class-1", "status": "confirmed"}'::jsonb, 'high', 'pending')
ON CONFLICT DO NOTHING;