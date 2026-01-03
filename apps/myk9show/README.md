# MyK9Show - Dog Show Management Platform

A comprehensive, offline-first dog show management application built with React, TypeScript, and modern web technologies. MyK9Show provides tools for exhibitors, judges, secretaries, and administrators to manage all aspects of dog shows and competitions.

## ⚠️ Current Status: Phase 8 (85% Complete)

**Database Integration**: 85% complete with critical blockers identified  
**Production Status**: ❌ **NOT READY** - 2-3 days remediation required  
**Performance**: ✅ Exceeds all targets (P95 < 50ms, bundle < 2MB)  
**Security**: ⚠️ 92% complete (46/50 tables with RLS)  

### 🚨 Critical Issues Blocking Production
1. **Template Store Circular Dependency** - Application fails to start
2. **SyncService Constructor Issues** - Real-time sync broken  
3. **70 ESLint Errors** - Code quality standards not met
4. **Build Timeout Issues** - TypeScript compilation problems

**Resolution Timeline**: 2-3 days • **Documentation**: Complete and ready  
**For Technical Details**: See `docs/Phase-8-Completion-Report.md`

## ✨ Features

### 🏆 **Competition Management**
- **Multi-format Support**: Scent Work, Agility, Obedience, Rally, Conformation, Tracking, and more
- **Real-time Scoring**: Live scoring interfaces for judges with instant calculation
- **Run Order Management**: Drag-and-drop scheduling with conflict detection
- **Class Templates**: Reusable templates for quick class creation

### 🐕 **Dog & Owner Management**
- **Comprehensive Profiles**: Complete dog registration, health records, and achievements
- **Multi-dog Registration**: Streamlined entry process for multiple dogs
- **Health Tracking**: Vaccination records, vet visits, and medical history
- **Achievement Tracking**: Titles, awards, and competition history

### 📱 **Offline-First Architecture**
- **Works Anywhere**: Full functionality without internet connection
- **Smart Sync**: Intelligent conflict resolution when back online
- **Data Export**: Backup and export capabilities in multiple formats
- **Real-time Indicators**: Clear sync status and offline mode indicators

### 👥 **Role-Based Access**
- **Exhibitors**: Register dogs, enter shows, track results
- **Judges**: Score competitions, manage assignments
- **Secretaries**: Organize shows, manage entries, generate reports
- **Administrators**: System configuration, user management, templates

### 🎨 **Modern User Experience**
- **Apple-Inspired Design**: Clean, intuitive interface following Apple's design principles
- **Responsive Layout**: Works perfectly on desktop, tablet, and mobile
- **Dark/Light Themes**: Automatic theme switching with user preferences
- **Accessibility**: Full keyboard navigation and screen reader support

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ (recommend using [nvm](https://github.com/nvm-sh/nvm))
- **npm** 9+ or **yarn** 1.22+
- **Git** for version control

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/myK9Show-Windsurf.git
   cd myK9Show-Windsurf
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your configuration
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:5173` to see the application.

### Development Commands

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build

# Code Quality
npm run lint         # Run ESLint
npm run type-check   # TypeScript type checking

# Testing
npm run test         # Run unit tests
npm run test:ui      # Run tests with UI
npm run test:coverage # Generate coverage reports
npm run test:e2e     # Run end-to-end tests

# Performance
npm run test:performance # Run performance tests
npm run test:all        # Run all test suites
```

## 🏗️ Architecture Overview

### Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + ShadCN UI Components
- **State Management**: Zustand with localStorage persistence
- **Data Layer**: IndexedDB (Dexie) for offline-first storage
- **Server State**: React Query (TanStack Query) for data fetching
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions)
- **Testing**: Vitest + Playwright + Testing Library
- **Build**: Vite with code splitting and optimization

### Project Structure

```
src/
├── components/          # React components organized by feature
│   ├── common/         # Shared components
│   ├── ui/             # ShadCN UI components
│   ├── dogs/           # Dog management components
│   ├── shows/          # Show management components
│   ├── scoring/        # Scoring interfaces
│   └── templates/      # Template management
├── hooks/              # Custom React hooks
│   ├── queries/        # Data fetching hooks
│   ├── mutations/      # Data mutation hooks
│   ├── ui/             # UI state management hooks
│   └── animations/     # Animation hooks
├── services/           # Business logic and API services
├── store/              # Zustand stores for state management
├── types/              # TypeScript type definitions
├── utils/              # Utility functions and helpers
├── test/               # Test files and utilities
└── lib/                # Third-party library configurations
```

### Key Design Patterns

- **Local-First**: All data stored locally with optional sync to cloud
- **Offline-Capable**: Full functionality without internet connection
- **Optimistic Updates**: Instant UI feedback with conflict resolution
- **Component Composition**: Reusable, composable UI components
- **Hook-Based Logic**: Custom hooks for data and UI state management
- **Type-Safe**: Comprehensive TypeScript coverage with strict mode

## 🔧 Configuration

### Environment Variables

Create a `.env.local` file in the project root:

```env
# Supabase Configuration (Optional - for cloud sync)
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Development Settings
VITE_DEV_MODE=true
VITE_MOCK_DATA=true

# Feature Flags
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_PUSH_NOTIFICATIONS=false
```

### Data Source Configuration

The application can work in multiple modes:

1. **Mock Data Mode** (default): Uses local mock data for development
2. **IndexedDB Mode**: Stores real data locally in the browser
3. **Hybrid Mode**: Local storage with optional cloud sync

Configure in `src/config/dataSource.ts`:

```typescript
export const DATA_SOURCE_CONFIG = {
  USE_MOCK_DOGS: true,    // Use mock dog data
  USE_MOCK_SHOWS: true,   // Use mock show data
  USE_SUPABASE: false,    // Enable cloud sync
  AUTO_SYNC: false        // Automatic background sync
};
```

## 📱 Deployment

### Production Build

```bash
# Build for production
npm run build

# Test production build locally
npm run preview
```

### Deployment Options

1. **Static Hosting** (Recommended for MVP)
   - Vercel, Netlify, or GitHub Pages
   - Zero configuration deployment
   - Automatic builds from Git

2. **Self-Hosted**
   - Any web server (Apache, Nginx, IIS)
   - Serve the `dist/` folder contents
   - Configure for SPA routing

3. **Docker**
   ```bash
   docker build -t myk9show .
   docker run -p 3000:3000 myk9show
   ```

### Deployment Checklist

- [ ] Set production environment variables
- [ ] Configure error monitoring (optional)
- [ ] Set up analytics (optional)
- [ ] Test offline functionality
- [ ] Verify PWA capabilities
- [ ] Configure caching headers

## 🧪 Testing

### Test Strategy

The application uses a comprehensive testing approach:

- **Unit Tests**: Component and function testing with Vitest
- **Integration Tests**: User workflow testing with Testing Library
- **E2E Tests**: Full application testing with Playwright
- **Performance Tests**: Load and responsiveness testing

### Running Tests

```bash
# Unit and integration tests
npm run test              # Run once
npm run test:watch        # Watch mode
npm run test:ui          # Visual test runner
npm run test:coverage    # With coverage reports

# End-to-end tests
npm run test:e2e         # All browsers
npm run test:e2e:ui      # With Playwright UI
npm run test:e2e:chrome  # Chrome only

# Performance tests
npm run test:performance # Performance benchmarks

# All tests
npm run test:all         # Complete test suite
```

### Test Coverage Goals

- **Minimum**: 75% overall coverage
- **Critical Paths**: 90%+ coverage for core features
- **Services**: 85%+ coverage for business logic
- **Components**: 70%+ coverage for UI components

## 🐛 Troubleshooting

### Common Issues

#### Development Server Won't Start

```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Check Node.js version
node --version  # Should be 18+
```

#### Build Failures

```bash
# Type check first
npm run type-check

# Check for linting errors
npm run lint

# Clean build
rm -rf dist
npm run build
```

#### Test Failures

```bash
# Update test snapshots
npm run test -- --update-snapshots

# Run tests in verbose mode
npm run test -- --reporter=verbose

# Check for browser issues (E2E)
npx playwright install
```

#### Performance Issues

- Check browser DevTools for memory leaks
- Verify IndexedDB storage usage
- Monitor network requests in offline mode
- Use React DevTools Profiler

### Getting Help

1. **Check the logs**: Browser console and network tab
2. **Search issues**: GitHub issues and discussions
3. **Documentation**: `/docs` folder for detailed guides
4. **Community**: Join our Discord server for real-time help

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Follow** our code standards (TypeScript strict mode, ESLint, Prettier)
4. **Write** tests for new functionality
5. **Commit** your changes (`git commit -m 'Add amazing feature'`)
6. **Push** to the branch (`git push origin feature/amazing-feature`)
7. **Open** a Pull Request

### Code Standards

- **TypeScript**: Strict mode enabled, comprehensive typing
- **Testing**: Minimum 75% coverage for new code
- **Documentation**: JSDoc for public APIs
- **Accessibility**: WCAG 2.1 AA compliance
- **Performance**: Lighthouse score >90

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **ShadCN/UI** for the excellent component library
- **React Team** for the amazing framework
- **Supabase** for the backend infrastructure
- **Dog Show Community** for requirements and feedback

---

**Built with ❤️ for the dog show community**

For more detailed documentation, visit our [docs folder](./docs/) or check out the [live documentation site](https://myk9show-docs.vercel.app).