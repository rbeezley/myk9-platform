-- 105_askq_myk9show.sql
-- Add user tracking columns to chatbot tables and create user_guide table

-- 1. Add columns to chatbot_query_log
ALTER TABLE chatbot_query_log
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS app_source TEXT NOT NULL DEFAULT 'myk9q',
  ADD COLUMN IF NOT EXISTS response_time_ms INTEGER;

-- Index for rate limiting queries (user + date)
CREATE INDEX IF NOT EXISTS idx_chatbot_query_log_user_daily
  ON chatbot_query_log (user_id, created_at)
  WHERE user_id IS NOT NULL;

-- 2. Add columns to chatbot_feedback (create if not exists — myK9Q uses rules_feedback)
CREATE TABLE IF NOT EXISTS chatbot_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_log_id UUID REFERENCES chatbot_query_log(id) ON DELETE CASCADE,
  question TEXT,
  ai_response TEXT,
  tools_used TEXT[],
  show_id BIGINT,
  license_key TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating SMALLINT CHECK (rating IN (-1, 1)),
  report_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for chatbot_feedback
ALTER TABLE chatbot_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage chatbot_feedback"
  ON chatbot_feedback FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can insert own chatbot_feedback"
  ON chatbot_feedback FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 3. Create user_guide table (empty, ready for content)
CREATE TABLE IF NOT EXISTS user_guide (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT[] DEFAULT '{}',
  search_vector tsvector,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_user_guide_search
  ON user_guide USING gin(search_vector);

-- Auto-update search_vector on insert/update
CREATE OR REPLACE FUNCTION update_user_guide_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''));
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_guide_search_vector
  BEFORE INSERT OR UPDATE ON user_guide
  FOR EACH ROW
  EXECUTE FUNCTION update_user_guide_search_vector();

-- RLS: public read
ALTER TABLE user_guide ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read user_guide"
  ON user_guide FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Service role can manage user_guide"
  ON user_guide FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
