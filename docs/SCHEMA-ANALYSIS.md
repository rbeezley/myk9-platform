# Schema Analysis for Database Consolidation

> Analysis for Phase 5.2 of the migration plan

## New Supabase Project

- **Project:** myk9-platform
- **URL:** https://sojmvhhwsjxmfistvzbe.supabase.co

---

## myK9Q Schema (86 migrations)

### Core Tables (pre-migration, created via Supabase/Flutter)
| Table | Purpose |
|-------|---------|
| `entries` | Combined entry + scoring data (merged from separate results table in migration 039) |
| `classes` | Class definitions with timing, status, configuration |
| `trials` | Trial configurations |
| `shows` | Show/event definitions |
| `dogs` | Dog registrations (likely minimal - call name, registration numbers) |

### Nationals-Specific Tables
| Table | Purpose |
|-------|---------|
| `nationals_scores` | Element-level scores for nationals competition |
| `nationals_rankings` | Cumulative rankings across elements |
| `nationals_advancement` | Advancement tracking between competition days |

### Announcements & Notifications
| Table | Purpose |
|-------|---------|
| `announcements` | System/show announcements |
| `announcement_reads` | Track which users read announcements |
| `announcement_rate_limits` | Prevent spam |
| `push_notification_config` | FCM configuration |
| `push_notification_queue` | Pending notifications |
| `push_notification_dead_letter` | Failed notifications |
| `push_subscriptions` | User push subscription tokens |

### Volunteers
| Table | Purpose |
|-------|---------|
| `volunteers` | Volunteer registrations |
| `volunteer_roles` | Available roles (gate steward, etc.) |
| `volunteer_class_assignments` | Per-class volunteer assignments |
| `volunteer_general_assignments` | General volunteer assignments |

### Rules Assistant
| Table | Purpose |
|-------|---------|
| `rules` | Parsed rule content |
| `rulebooks` | Rule book definitions (AKC, UKC, etc.) |
| `rule_organizations` | Organizations (AKC, UKC, ASCA) |
| `rule_sports` | Sports (Scent Work, Rally, etc.) |
| `rules_feedback` | User feedback on rule answers |
| `rules_query_log` | Query history for analytics |
| `chatbot_query_log` | AI query logging |

### Result Visibility Controls
| Table | Purpose |
|-------|---------|
| `show_result_visibility_defaults` | Default visibility per show |
| `trial_result_visibility_overrides` | Trial-level overrides |
| `class_result_visibility_overrides` | Class-level overrides |

### Performance & Audit
| Table | Purpose |
|-------|---------|
| `performance_metrics` | Performance tracking |
| `performance_session_summaries` | Session-level summaries |
| `entry_audit` | Entry change audit log |
| `login_attempts` | Security logging |
| `user_preferences` | User settings |

---

## myK9Show Schema (56 migrations)

### Core Entities
| Table | Purpose |
|-------|---------|
| `dogs` | Full dog records (breed, registration, pedigree, medical) |
| `people` | Handlers, owners, judges, secretaries |
| `clubs` | Dog clubs and organizations |
| `shows` | Show/event definitions |
| `show_trials` | Trials within shows |
| `classes` | Class definitions |
| `entries` | Entry registrations |
| `results` | Scoring results (separate from entries) |
| `past_results` | Historical results |

### Registrations & Draft Entries
| Table | Purpose |
|-------|---------|
| `show_registrations` | Show-level registration |
| `dog_registrations` | Dog registration numbers |
| `draft_entries` | Incomplete entries |
| `armbands` | Armband assignments |

### Templates
| Table | Purpose |
|-------|---------|
| `class_templates` | Reusable class configurations |
| `show_templates` | Reusable show configurations |
| `template_fields` | Custom template fields |

### Health & Medical
| Table | Purpose |
|-------|---------|
| `health_records` | General health records |
| `vaccinations` | Vaccination records |
| `medications` | Medication records |
| `allergies` | Allergy records |
| `vet_visits` | Vet visit history |
| `achievements` | Title/achievement tracking |

### Judges
| Table | Purpose |
|-------|---------|
| `judge_assignments` | Judge-to-class assignments |
| `judge_certifications` | Judge certifications by sport |
| `judge_qualifications` | Judge qualification levels |

### RBAC (Role-Based Access Control)
| Table | Purpose |
|-------|---------|
| `roles` | Role definitions |
| `permissions` | Permission definitions |
| `role_permissions` | Role-to-permission mapping |
| `user_roles` | User-to-role mapping |
| `permission_audit_log` | Permission change audit |

### Notifications
| Table | Purpose |
|-------|---------|
| `notification_queue` | Pending notifications |
| `notification_templates` | Notification message templates |
| `notification_triggers` | Event triggers for notifications |
| `notification_events` | Notification events |
| `notification_delivery_log` | Delivery tracking |
| `notification_preferences` | User notification preferences |
| `fcm_tokens` | Firebase Cloud Messaging tokens |

### Payments (Stripe)
| Table | Purpose |
|-------|---------|
| `stripe_customers` | Customer records |
| `stripe_orders` | Order/payment records |
| `stripe_subscriptions` | Subscription records |

### Sync & Offline
| Table | Purpose |
|-------|---------|
| `sync_queue` | Pending sync operations |
| `sync_conflicts` | Conflict resolution records |
| `offline_scoring` | Offline score submissions |

### Search & Analytics
| Table | Purpose |
|-------|---------|
| `search_history` | User search history |
| `search_analytics` | Search analytics |

### System
| Table | Purpose |
|-------|---------|
| `entry_status_history` | Entry status change log |
| `audit_entries` | General audit log |
| `system_alerts` | System-wide alerts |
| `user_preferences` | User settings |
| `impersonation_sessions` | Admin impersonation tracking |

---

## Overlapping Tables

| Concept | myK9Q | myK9Show | Resolution Strategy |
|---------|-------|----------|---------------------|
| Dogs | Minimal dog info | Full dog records | Use myK9Show schema, myK9Q references same dogs |
| Shows | `shows` | `shows` | Unify - mostly compatible |
| Trials | `trials` | `show_trials` | Unify - rename to `trials` |
| Classes | `classes` | `classes` | Merge fields - myK9Q has more scoring fields |
| Entries | `entries` (with scores) | `entries` + `results` | Use myK9Q merged approach for simplicity |
| Results | Merged into `entries` | Separate `results` | Migrate to merged approach |
| User Preferences | `user_preferences` | `user_preferences` | Merge with app-specific namespacing |

---

## Unique Tables by App

### myK9Q Only
- Nationals scoring system (nationals_scores, nationals_rankings, nationals_advancement)
- Volunteers system
- Rules Assistant system
- Result visibility controls
- Push notification system (queue-based)

### myK9Show Only
- Full dog/health management
- People/handlers management
- Templates system
- Judges management
- RBAC system
- Stripe payments
- FCM notifications (token-based)
- Armbands
- Draft entries

---

## Recommended Unified Schema Approach

### Phase 1: Core Shared Tables
1. `dogs` - Use myK9Show's full schema
2. `people` - Use myK9Show's schema (handlers, owners, judges)
3. `clubs` - Use myK9Show's schema
4. `shows` - Merge both schemas
5. `trials` - Merge both schemas
6. `classes` - Merge with myK9Q's scoring fields
7. `entries` - Use myK9Q's merged entries+results approach

### Phase 2: App-Specific Tables
- Copy myK9Q nationals, volunteers, rules tables as-is
- Copy myK9Show health, templates, judges, RBAC, payments tables as-is

### Phase 3: Notifications
- Evaluate whether to unify notification systems or keep separate
- Option A: Unified notification queue with app_source field
- Option B: Keep separate (simpler, less risk)

---

## Next Steps

1. [ ] Export current schemas from both Supabase projects
2. [ ] Create unified migration scripts for new project
3. [ ] Design RLS policies for multi-app access
4. [ ] Create test data migration scripts
