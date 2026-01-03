# myK9Q Documentation

Complete documentation for the myK9Q React application.

## 📁 Documentation Structure

### [push-notifications/](push-notifications/)
Complete push notification system implementation and production readiness.
- **Start here**: [PUSH_NOTIFICATION_COMPLETE.md](push-notifications/PUSH_NOTIFICATION_COMPLETE.md)
- Production status, testing, security fixes
- Browser compatibility, retry system
- PWA notifications, rate limiting

### [performance/](performance/)
Performance optimization documentation and monitoring.
- Critical path optimizations
- Metrics and dashboards
- Home page optimizations
- Performance phases implementation

### [implementation-phases/](implementation-phases/)
Historical phase-by-phase implementation summaries.
- Phase 1-9 completion summaries
- EntryList refactoring
- Settings implementation
- Feature rollout documentation

### [migrations/](migrations/)
Database migration plans and guides.
- Migration planning and testing
- Notification triggers
- Feedback changes

### [features/](features/)
Feature-specific implementation guides.
- Haptic feedback
- User experience enhancements

### [accessibility/](accessibility/)
Accessibility audits and improvements.
- Touch target audits
- WCAG compliance

### [guides/](guides/)
How-to guides and tutorials.
- Flutter auto-login
- Developer guides

### [testing/](testing/)
Testing documentation and status.
- Test status reports
- Theme testing
- Component testing

### [plans/](plans/)
Implementation plans and design documents.
- Feature design specs
- Implementation roadmaps

### [analysis/](analysis/)
Code analysis and technical debt tracking.
- Dependency analysis
- Tech debt register

### [style-guides/](style-guides/)
Design system and styling documentation.
- Design system patterns
- Outdoor visibility patterns
- Page templates

## 🚀 Quick Start for New Developers

1. **Project Overview**: Read [../CLAUDE.md](../CLAUDE.md) in project root
2. **Database Reference**: [DATABASE_REFERENCE.md](DATABASE_REFERENCE.md) - Views, functions, query patterns
3. **CSS Architecture**: [CSS_ARCHITECTURE.md](CSS_ARCHITECTURE.md) - CSS patterns and design tokens
4. **Security Audit**: [SECURITY_AUDIT_2025-11-17.md](SECURITY_AUDIT_2025-11-17.md) - Latest security fixes

## 📋 Core Documentation

**Essential References:**
- [../CLAUDE.md](../CLAUDE.md) - Claude Code AI instructions & project guidelines
- [DATABASE_REFERENCE.md](DATABASE_REFERENCE.md) - Database views, functions, triggers, query patterns
- [CSS_ARCHITECTURE.md](CSS_ARCHITECTURE.md) - CSS patterns and design tokens
- [CSS-IMPROVEMENT-ROADMAP.md](CSS-IMPROVEMENT-ROADMAP.md) - Design system consolidation roadmap

**Architecture:**
- [SCORING_ARCHITECTURE.md](SCORING_ARCHITECTURE.md) - Scoring system architecture
- [OFFLINE_FIRST_PATTERNS.md](OFFLINE_FIRST_PATTERNS.md) - Offline-first implementation
- [NOTIFICATION_SYSTEM.md](NOTIFICATION_SYSTEM.md) - Push notification architecture
- [UNIFIED_ARCHITECTURE.md](UNIFIED_ARCHITECTURE.md) - Overall system architecture

**Security:**
- [SECURITY_AUDIT_2025-11-17.md](SECURITY_AUDIT_2025-11-17.md) - RLS policies, function security
- [SECURITY_DEFINER_VIEWS.md](SECURITY_DEFINER_VIEWS.md) - Database view security

## 🎨 Design System

- [design-system-components.md](design-system-components.md) - Component library
- [CSS_ARCHITECTURE.md](CSS_ARCHITECTURE.md) - CSS patterns
- [style-guides/design-system.md](style-guides/design-system.md) - Design tokens

## 🗂️ Root Directory Files

Key files in project root:
- `CLAUDE.md` - AI coding guidelines and project context
- `README.md` - Main project documentation

All other documentation is organized in this `docs/` folder.

## 🔗 External Resources

- [Supabase Documentation](https://supabase.com/docs)
- [React Documentation](https://react.dev)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Vite Documentation](https://vitejs.dev)
- [Zustand Documentation](https://github.com/pmndrs/zustand)

## 📝 Contributing

When adding new documentation:
1. Choose the appropriate subfolder
2. Use clear, descriptive filenames
3. Add a summary to this README
4. Update relevant index files
5. Keep active work docs in project root only when necessary

---
*Last updated: 2025-12-12*
