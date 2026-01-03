# myK9Show - Professional Dog Show Scoring Application

A modern, production-ready Progressive Web App (PWA) for professional dog show ring scoring and management. Built with React, TypeScript, and Supabase for real-time collaboration across multiple judges, stewards, and exhibitors.

## Features

### 🏆 Multi-Organization Support
- **AKC (American Kennel Club)**: Scent Work, FastCat
- **UKC (United Kennel Club)**: Obedience, Rally, Agility
- **ASCA (Australian Shepherd Club of America)**: Scent Detection

### 📱 Modern PWA Design
- **Offline-first architecture** for remote competition venues
- **Apple-inspired UI** with sophisticated design patterns
- **Real-time synchronization** when connectivity returns
- **Touch-optimized interface** for mobile judging

### 👥 Role-Based Authentication
- **Admin**: Full system access and passcode management
- **Judge**: Scoresheet access and run order management
- **Steward**: Entry management and check-in coordination
- **Exhibitor**: View-only access for their entries

### ⚡ Real-Time Features
- Live score updates across all connected devices
- Instant check-in status synchronization
- Multi-timer support for complex scoring scenarios
- Haptic feedback for improved mobile experience

## Tech Stack

- **Frontend**: React 19.2.0 + TypeScript 5.9.3
- **State Management**: Zustand 5.0.8 with devtools middleware
- **Routing**: React Router DOM 7.9.5
- **Database**: Supabase 2.79.0 (PostgreSQL + Real-time subscriptions)
- **Styling**: Semantic CSS with design tokens (no utility-first framework)
- **Build**: Vite 7.2.0 with PWA plugin
- **Testing**: Vitest 4.0.7 + React Testing Library + Playwright
- **UI Components**: Lucide React icons, @dnd-kit for drag-and-drop

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- Supabase account and project

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/rbeezley/myK9Q-React.git
   cd myK9Q-React
   npm install
   ```

2. **Environment Configuration:**
   
   **🚨 IMPORTANT: Required for login to work!**
   
   **Option A: Automated Setup (Recommended)**
   ```bash
   npm run setup
   ```
   This interactive script will guide you through setting up your Supabase credentials.
   
   **Option B: Manual Setup**
   ```bash
   # Copy the environment template
   cp .env.local.example .env.local
   ```
   
   Then edit `.env.local` with your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
   ```
   
   **Where to find these values:**
   - Go to https://app.supabase.com/project/[your-project]/settings/api
   - Copy your Project URL and anon/public key
   - Paste them into `.env.local`

3. **Database Setup:**

   The application uses a normalized database schema. For the complete database setup, run the migrations in `supabase/migrations/` in order. Key tables include:

   ```sql
   -- Core normalized tables
   CREATE TABLE shows (
     id SERIAL PRIMARY KEY,
     license_key TEXT NOT NULL,
     show_name TEXT NOT NULL,
     club_name TEXT NOT NULL,
     show_date DATE NOT NULL,
     competition_type TEXT DEFAULT 'Regular'
     -- ... additional fields
   );

   CREATE TABLE trials (
     id SERIAL PRIMARY KEY,
     show_id INTEGER REFERENCES shows(id),
     trial_name TEXT NOT NULL,
     trial_number INTEGER,
     trial_date DATE
     -- ... additional fields
   );

   CREATE TABLE classes (
     id SERIAL PRIMARY KEY,
     trial_id INTEGER REFERENCES trials(id),
     element TEXT NOT NULL,
     level TEXT NOT NULL,
     self_checkin_enabled BOOLEAN DEFAULT true
     -- ... additional fields
   );

   CREATE TABLE entries (
     id SERIAL PRIMARY KEY,
     class_id INTEGER REFERENCES classes(id),
     armband_number INTEGER NOT NULL,
     dog_call_name TEXT NOT NULL,
     handler_name TEXT NOT NULL,
     check_in_status INTEGER DEFAULT 0
     -- ... additional fields
   );

   CREATE TABLE results (
     id SERIAL PRIMARY KEY,
     entry_id INTEGER REFERENCES entries(id),
     is_scored BOOLEAN DEFAULT false,
     search_time_seconds NUMERIC,
     total_faults INTEGER DEFAULT 0,
     placement INTEGER,
     result_status TEXT
     -- ... additional fields
   );
   ```

   **Note**: See `supabase/migrations/` for complete schema with all fields, indexes, and RLS policies.

4. **Development:**
   ```bash
   # Start development server
   npm run dev
   
   # Type checking
   npm run typecheck
   
   # Linting
   npm run lint
   
   # Production build
   npm run build
   ```

## Authentication System

### Passcode Generation
Passcodes are automatically generated from license keys:
- `a` + 4 digits = Admin access
- `j` + 4 digits = Judge access  
- `s` + 4 digits = Steward access
- `e` + 4 digits = Exhibitor access

Example: License key `myK9Q1-d8609f3b-d3fd43aa-6323a604` generates:
- Admin: `ad860`
- Judge: `j9f3b`
- Steward: `sd3fd`
- Exhibitor: `e6323`

### Show Context
Each authentication includes:
- Show information (name, date, club)
- License key for data filtering
- Organization type (AKC, UKC, ASCA)
- Competition level (Regular, National, etc.)

## Scoresheet System

### Dynamic Scoresheet Selection
Routes are automatically determined by:
1. Organization type (AKC/UKC/ASCA)
2. Competition element (Scent Work, Obedience, etc.)
3. Class level (Novice, Advanced, Excellent, Masters)

### Supported Scoresheets
- **AKC Scent Work**: Multi-area timing with qualification logic
- **AKC FastCat**: Speed-based scoring with MPH calculations
- **UKC Obedience**: Traditional obedience scoring
- **UKC Rally**: Rally course scoring with point deductions
- **ASCA Scent Detection**: Australian Shepherd specific scoring

### Offline Functionality
- Scores queue automatically when offline
- Real-time sync when connectivity returns
- Visual indicators for connection status
- Optimistic UI updates for immediate feedback

## Database Schema

### Core Tables
- `shows`: Show/trial container with license key for multi-tenancy
- `trials`: Trial instances linked to shows
- `classes`: Class definitions with configurable rules and settings
- `entries`: Dog entries with armband, handler, and check-in status
- `results`: Scoring results with times, faults, and placements
- `class_requirements`: Organization-specific class requirements

### Performance Views
- `view_class_summary`: Pre-aggregated entry counts and statistics per class
- `view_entry_with_results`: Pre-joined entries + results for faster queries
- `view_entry_class_join_normalized`: Multi-table join for combined queries
- `view_trial_summary_normalized`: Trial summary with show context

### Key Features
- **Normalized schema**: Clean table structure without legacy prefixes
- **License key filtering**: Multi-tenant architecture via `license_key` field
- **Real-time triggers**: Instant updates across clients via Supabase subscriptions
- **Check-in status tracking**: Integer codes (0-3) for status management
- **Configurable class rules**: Database-driven class requirements and warnings
- **Complete audit trail**: All scoring actions tracked in `results` table

## Architecture Patterns

### State Management
```typescript
// Zustand stores for different concerns
useEntryStore()     // Entry data and filters
useScoringStore()   // Active scoring sessions
useOfflineQueue()   // Offline sync management
```

### Service Layer
```typescript
// Clean separation of concerns
entryService.ts     // Entry CRUD operations
authService.ts      // Authentication logic
syncService.ts      // Offline synchronization
```

### Component Organization
```
components/
├── ui/           # Reusable UI components
├── auth/         # Authentication components
└── scoring/      # Scoring-specific components

pages/
├── scoresheets/  # Organization-specific scoresheets
├── Home/         # Dashboard and navigation
└── ClassList/    # Class and entry management
```

## Performance Optimization

### Bundle Analysis
- **Main bundle**: 431.21 kB (121.61 kB gzipped)
- **Service worker**: Generated for offline functionality
- **Code splitting**: Route-based lazy loading ready

### Best Practices
- Memoized expensive calculations
- Optimistic UI updates
- Efficient re-render prevention
- Memory leak prevention with proper cleanup

## Testing

### Current Coverage
```bash
# Run existing tests
npm test

# Run with coverage
npm run test:coverage
```

### Test Structure
- **Unit tests**: Authentication utilities (src/utils/auth.test.ts)
- **Integration tests**: Component interaction testing
- **E2E tests**: Complete user workflow validation

## Deployment

### Production Build
```bash
npm run build
```

### Environment Variables
```env
# Required
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Optional
VITE_APP_VERSION=1.0.0
VITE_ENVIRONMENT=production
```

### PWA Features
- **Offline caching**: Essential assets cached for offline use
- **App manifest**: Native app-like installation
- **Service worker**: Background sync and push notifications ready

## Contributing

### Development Guidelines
1. Follow TypeScript strict mode requirements
2. Use existing component patterns and conventions
3. Maintain test coverage for new features
4. Follow the established file organization structure

### Code Quality
- **ESLint**: Configured with TypeScript rules
- **Prettier**: Consistent code formatting
- **Husky**: Pre-commit hooks for quality gates

## Support

### Documentation
- **Database Schema**: See `docs/database.md`
- **API Reference**: See `docs/api.md`
- **Deployment Guide**: See `docs/deployment.md`

### Common Issues

#### 🚫 "Missing Supabase environment variables" Error
**Symptoms:** Login page doesn't load, console shows Supabase error
**Solution:**
1. Ensure `.env.local` file exists in project root
2. Verify it contains valid `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
3. Restart development server: `npm run dev`
4. Check browser console for detailed error messages

#### 🌐 Connection Issues
**Symptoms:** API calls failing, network errors
**Solutions:**
- Check Supabase project status and configuration
- Verify network connectivity
- Check browser network tab for failed requests

#### 🔐 Authentication Problems  
**Symptoms:** Login fails, invalid credentials
**Solutions:**
- Verify license key format and database access
- Check Supabase RLS policies
- Ensure passcode generation logic matches database

#### 📱 PWA/Offline Issues
**Symptoms:** App doesn't work offline, sync problems
**Solutions:**
- Monitor browser storage and service worker status
- Check Application tab in browser dev tools
- Clear cache and reload if needed

## License

Private/Commercial - All rights reserved.

---

**Built with ❤️ for the dog show community**