-- Migration: Create unified audit log view for tracking all competition admin changes
-- Created: 2025-11-03
-- Purpose: Combine show, trial, and class visibility/self-checkin changes into single queryable view

-- Create unified audit log view
CREATE OR REPLACE VIEW view_audit_log AS
-- Show-level visibility changes
SELECT
  'show_visibility' as change_type,
  'Show Level' as scope,
  s.license_key,
  s.show_name,
  NULL::BIGINT as trial_id,
  NULL::INTEGER as trial_number,
  NULL::BIGINT as class_id,
  NULL::TEXT as element,
  NULL::TEXT as level,
  NULL::TEXT as section,
  'visibility' as setting_category,
  svd.preset_name as setting_value,
  svd.updated_by,
  svd.updated_at
FROM show_result_visibility_defaults svd
JOIN shows s ON s.license_key = svd.license_key

UNION ALL

-- Trial-level visibility changes
SELECT
  'trial_visibility' as change_type,
  'Trial Level' as scope,
  s.license_key,
  s.show_name,
  t.id as trial_id,
  t.trial_number,
  NULL::BIGINT as class_id,
  NULL::TEXT as element,
  NULL::TEXT as level,
  NULL::TEXT as section,
  'visibility' as setting_category,
  tvo.preset_name as setting_value,
  tvo.updated_by,
  tvo.updated_at
FROM trial_result_visibility_overrides tvo
JOIN trials t ON t.id = tvo.trial_id
JOIN shows s ON s.id = t.show_id

UNION ALL

-- Class-level visibility changes
SELECT
  'class_visibility' as change_type,
  'Class Level' as scope,
  s.license_key,
  s.show_name,
  t.id as trial_id,
  t.trial_number,
  c.id as class_id,
  c.element,
  c.level,
  c.section,
  'visibility' as setting_category,
  cvo.preset_name as setting_value,
  cvo.updated_by,
  cvo.updated_at
FROM class_result_visibility_overrides cvo
JOIN classes c ON c.id = cvo.class_id
JOIN trials t ON t.id = c.trial_id
JOIN shows s ON s.id = t.show_id

ORDER BY updated_at DESC;

-- Add comment
COMMENT ON VIEW view_audit_log IS 'Unified audit log combining all competition admin changes (visibility and self-checkin settings) across show, trial, and class levels';
