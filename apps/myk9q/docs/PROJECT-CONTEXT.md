# myK9Q-React Project Context
## Complete Background for New Claude Sessions

### Project Overview
This is a React web application to replace the existing Flutter myK9Q mobile app. myK9Q is a specialized scoring application for dog show judges to score competitions at ringside.

**Key Context**: This is part of a larger ecosystem including myK9Show (a comprehensive dog show management web application).

---

## Background & Relationships

### The myK9Show Ecosystem
1. **myK9Show** - Main web application for dog show management
   - **Location**: `D:\AI-Projects\myK9Show-Windsurf`
   - **Technology**: React + TypeScript + Vite + Supabase + ShadCN UI
   - **Purpose**: Complete dog show management (entries, classes, shows, people, dogs)
   - **Users**: Show secretaries, exhibitors, club administrators
   - **Database**: Modern Supabase schema with proper relationships

2. **myK9Q (Flutter)** - Existing mobile scoring app  
   - **Location**: `D:\AI-Projects\myK9Q-React\my_k9_q_nationals\` (extracted from ZIP)
   - **Technology**: Flutter + FlutterFlow + Supabase
   - **Purpose**: Ringside scoring for judges during competitions
   - **Users**: Dog show judges
   - **Database**: Older Supabase schema with different table names
   - **Status**: TO BE REPLACED by this React project

3. **myK9Q-React** - This project (replacement for Flutter)
   - **Location**: `D:\AI-Projects\myK9Q-React`
   - **Technology**: React + TypeScript + Supabase (planned)
   - **Purpose**: Web-based scoring app for judges (works on tablets)
   - **Goal**: Replace Flutter app, then integrate with myK9Show

---

## Critical Understanding: Two-Phase Migration

### Phase 1: React App + myK9Q Database (Current Goal)
```
React myK9Q ──→ myK9Q Supabase DB (existing Flutter database)
```
- **Goal**: Replace Flutter app with React web app
- **Database**: Keep using existing myK9Q Supabase project
- **Benefit**: Immediate Flutter retirement, zero data migration risk
- **Timeline**: 4-6 weeks

### Phase 2: Integration with myK9Show Database (Future)
```
React myK9Q ──┐
              ├──→ myK9Show Supabase DB (unified system)
myK9Show Web ─┘
```
- **Goal**: Unified database for all applications
- **Database**: Migrate to myK9Show's modern schema
- **Benefit**: Single source of truth, enhanced features
- **Timeline**: 2-3 weeks after Phase 1

---

## Competition Types Supported (Critical for Development)

The Flutter analysis revealed myK9Q supports **7 competition types**:

1. **AKC Scent Work** - Multi-area timing (1-3 areas), millisecond precision
2. **AKC Scent Work National** - Enhanced rules version
3. **AKC Fast CAT** - Speed scoring with mandatory health checks
4. **UKC Obedience** - Decimal point scoring (e.g., 185.5 out of 200.0)
5. **UKC Rally** - Fault counting system (increment/decrement)
6. **UKC Nosework** - Time + fault combination
7. **ASCA Scent** - Specialty organization rules

**Each competition type has different scoring methods** - this is crucial for UI design.

---

## Key Technical Requirements (From Flutter Analysis)

### Timer System
- **Precision**: Milliseconds (MM:SS.ms format)
- **Multi-area**: Up to 3 simultaneous timers for Scent Work
- **Audio alerts**: Sound when time limits exceeded
- **Visual feedback**: Progress bars and countdown displays

### Scoring Methods
- **Points**: Decimal entry with masking (###.#)
- **Time**: Millisecond precision timing
- **Faults**: Increment/decrement counters
- **Qualifying**: Binary Q/NQ/EX/DQ selection
- **Health checks**: Mandatory for Fast CAT events

### Real-time Features
- **Live updates**: Supabase subscriptions for entry changes
- **Multi-judge**: Coordination between multiple judges
- **Notifications**: Audio alerts for announcements
- **Sync status**: Connection indicators and offline mode

### Judge-Focused UX
- **Large touch targets**: Optimized for gloved hands
- **High contrast**: Readable in bright outdoor conditions
- **Audio feedback**: Confirmation sounds and alerts
- **Tablet optimization**: Primary target is iPad/Android tablet
- **Minimal cognitive load**: Simple, focused interfaces

---

## Database Schema Context

### Phase 1: myK9Q Database (Flutter-compatible)
```sql
-- Key tables from Flutter analysis
tbl_entry_queue          -- Individual entries
tbl_class_queue          -- Class definitions  
tbl_trial_queue          -- Trial information
tbl_announcements        -- Real-time notifications

-- Key view (main data source)
view_entry_class_join_distinct -- Combined entry/class/trial data

-- Important fields
armband (int)            -- Competitor number
call_name (string)       -- Dog name  
breed (string)           -- Dog breed
handler (string)         -- Handler name
result_text (string)     -- Q/NQ/EX/DQ
search_time (string)     -- Recorded time
fault_count (int)        -- Number of faults
is_scored (boolean)      -- Scoring complete flag
in_ring (boolean)        -- Currently being judged
```

### Phase 2: myK9Show Database (Modern schema)
```sql
-- Modern relational schema (from myK9Show analysis)
dogs                     -- Dog profiles
people                   -- People (owners, handlers, judges)
shows                    -- Show events
classes                  -- Class definitions
entries                  -- Entry registrations  
scoring_sessions         -- Judge scoring sessions
competitor_scores        -- Individual scores

-- Proper relationships with foreign keys
-- Better type safety
-- More normalized structure
```

---

## Existing Documentation Available

### In This Project (`D:\AI-Projects\myK9Q-React\docs\`)
1. **`migration-implementation-plan.md`** - Complete development plan with checkboxes
2. **`myK9Q/flutter-analysis-report.md`** - Detailed Flutter app analysis
3. **`myK9Q/scoring-interface-spec-updated.md`** - UI specifications based on Flutter
4. **`myK9Q/shared-components-updated.md`** - Component library specifications
5. **`myK9Q/api-integration.md`** - API and sync strategies
6. **`myK9Q/myK9Q-development-plan.md`** - Original development roadmap
7. **`myK9Q/two-phase-migration-plan.md`** - Strategic migration approach

### In myK9Show Project (`D:\AI-Projects\myK9Show-Windsurf\`)
1. **`CLAUDE.md`** - Essential development guidance and patterns
2. **`src/types/scoring/`** - Shared TypeScript types for scoring system
3. **`docs/style-guides/`** - Design system and UI patterns
4. **Existing components** - Reference implementations for UI patterns

---

## Key Insights from Flutter Analysis

### What Works Well (Preserve These)
- **Multi-competition support** - Handles diverse scoring methods seamlessly
- **Precision timing** - Millisecond accuracy with multiple simultaneous timers
- **Real-time sync** - Supabase subscriptions for live updates
- **Offline capability** - Local queue with auto-sync when connected
- **Judge-focused UX** - Large controls, audio feedback, minimal cognitive load
- **Audio alerts** - Custom sounds for timer expiration and notifications
- **Haptic feedback** - Touch feedback for better user experience

### Pain Points to Improve
- **Code organization** - FlutterFlow generated verbose, hard-to-maintain code
- **Type safety** - Inconsistent null handling and manual type conversions
- **State management** - Global state becomes unwieldy
- **Testing** - Limited test coverage, manual testing only

### React Advantages Over Flutter
- **No app store approvals** - Instant updates when deployed
- **Better integration** - Easier to integrate with myK9Show web app
- **Superior development tools** - TypeScript, better debugging
- **Unified codebase** - Same patterns as myK9Show

---

## Development Environment Context

### myK9Show Reference Project
- **Build command**: `npm run build` (MUST pass with 0 errors)
- **Lint command**: `npm run lint` (MUST pass before commits)
- **Tech stack**: React 18 + TypeScript + Vite + Tailwind + ShadCN UI + Zustand + React Query + Supabase
- **Key patterns**: Feature-based components, Zustand stores, React Query for server state

### This Project Setup (Planned)
```json
{
  "name": "myk9q-react",
  "dependencies": {
    "react": "^18.3.1",
    "@supabase/supabase-js": "^2.39.7",
    "zustand": "^5.0.4", 
    "@tanstack/react-query": "^5.75.5",
    "react-router-dom": "^6.22.3",
    "tailwindcss": "^3.4.1"
  }
}
```

---

## Current Status & Next Steps

### Project Status
- ✅ **Analysis Complete**: Flutter app fully analyzed
- ✅ **Documentation Complete**: All specifications written
- ✅ **Strategy Defined**: Two-phase migration plan approved
- ⏳ **Ready to Start**: Phase 1 development can begin

### Immediate Next Steps (Phase 1, Week 1)
1. **Set up React project** with TypeScript and Vite
2. **Configure Supabase** connection to existing myK9Q database
3. **Implement authentication** (same login as Flutter app)
4. **Create basic navigation** (Home → Class List → Entry List)
5. **Build first scoresheet** (UKC Obedience recommended as simplest)

### Success Criteria for New Claude Session
A new Claude session should be able to:
- ✅ **Understand the full context** of myK9Show + myK9Q ecosystem
- ✅ **Know the two-phase strategy** and current phase goals
- ✅ **Reference Flutter analysis** for feature requirements
- ✅ **Use existing documentation** for implementation guidance
- ✅ **Continue development** from any checkpoint in the plan
- ✅ **Make informed decisions** about architecture and patterns

---

## Important Commands & Locations

### File Locations
- **This project**: `D:\AI-Projects\myK9Q-React`
- **myK9Show reference**: `D:\AI-Projects\myK9Show-Windsurf`
- **Flutter source**: `D:\AI-Projects\myK9Q-React\my_k9_q_nationals\`

### Key Commands (when project is set up)
```bash
# Development
npm run dev           # Start development server
npm run build         # Build for production (must pass)
npm run lint          # Lint code (must pass)

# Reference commands from myK9Show
cd D:\AI-Projects\myK9Show-Windsurf
npm run build         # See working patterns
```

---

## Critical Decision Record

### Architecture Decisions Made
1. **React web app over React Native** - Works on tablets, no app store needed
2. **Two-phase migration** - Minimize risk while achieving goals
3. **Supabase for backend** - Maintain compatibility with existing systems
4. **TypeScript throughout** - Better than Flutter's null handling
5. **Component-based scoresheets** - One per competition type

### Integration Strategy
- **Phase 1**: Same database as Flutter (immediate replacement)
- **Phase 2**: Migrate to myK9Show database (unified system)
- **Deployment**: Web app hosted, accessible on any tablet browser

---

## Questions a New Claude Session Might Ask

### "What is myK9Q?"
A scoring application for dog show judges to score competitions at ringside. Supports 7 different competition types with different scoring methods.

### "How does this relate to myK9Show?"
myK9Show is the main dog show management application. myK9Q is the specialized scoring component. They will eventually share a unified database.

### "Why replace Flutter?"
Flutter app works but has maintenance issues. React provides better integration with myK9Show and easier updates.

### "What phase are we in?"
Phase 1 - building React app that uses the existing Flutter database. This allows immediate Flutter retirement.

### "What should I work on first?"
Follow the migration-implementation-plan.md checkboxes. Start with Week 1 tasks: project setup, Supabase connection, authentication.

### "How do I understand the requirements?"
Read the Flutter analysis documents. They contain exact specifications for all 7 competition types based on analysis of working Flutter code.

---

Last Updated: 2025-08-12
Status: ✅ Complete Context - Ready for New Claude Sessions