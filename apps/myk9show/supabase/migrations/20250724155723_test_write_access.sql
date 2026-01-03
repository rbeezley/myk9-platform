-- Test migration to verify write access
CREATE TABLE IF NOT EXISTS test_table (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert test data
INSERT INTO test_table (name) VALUES ('Test Entry 1'), ('Test Entry 2');

-- Create a simple view
CREATE VIEW test_view AS
SELECT id, name, created_at
FROM test_table
WHERE created_at >= CURRENT_DATE;