-- Backup script for template data before migration
-- Run this query in Supabase SQL editor to export template data

-- Export class templates
SELECT * FROM class_templates;

-- Export show templates  
SELECT * FROM show_templates;

-- Export template fields
SELECT * FROM template_fields;

-- Export template rules
SELECT * FROM template_rules;

-- After migration, you can reimport this data with appropriate ID mappings