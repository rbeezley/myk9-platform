---
description: Run Supabase security and performance advisors
---

# Database Health Check

Run Supabase advisors to check for security vulnerabilities and performance issues.

## Step 1: Security Advisor

Use `mcp__supabase__get_advisors` with type "security" to check for:
- Missing RLS policies
- Exposed sensitive data
- Insecure function definitions
- Public schema vulnerabilities

## Step 2: Performance Advisor

Use `mcp__supabase__get_advisors` with type "performance" to check for:
- Missing indexes
- Slow queries
- Inefficient table scans
- Bloated tables

## Step 3: Report Results

Format findings as a table:

### Security Issues
| Severity | Issue | Table/Function | Remediation |
|----------|-------|----------------|-------------|
| ... | ... | ... | [Link to fix] |

### Performance Issues
| Severity | Issue | Table/Function | Remediation |
|----------|-------|----------------|-------------|
| ... | ... | ... | [Link to fix] |

## Step 4: Summary

Provide a summary:
- Total security issues found
- Total performance issues found
- Critical items requiring immediate attention
- Recommended next actions

If no issues found, confirm the database is healthy.

## Important

- Include remediation URLs as clickable links so user can reference the issue
- Flag any CRITICAL or HIGH severity issues prominently
- Suggest running this check after DDL changes (migrations)
