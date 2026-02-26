-- =============================================================================
-- Migration 032: Drop class_templates table
-- =============================================================================
-- The class_templates table (created in 005) is replaced by sport_templates +
-- sport_class_rules (029/030). This migration removes the now-unused table.
-- The template_fields table is kept (may be used by other features).
-- =============================================================================

DROP TABLE IF EXISTS class_templates CASCADE;
