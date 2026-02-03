# @myk9/ui

Shared UI components and design system for the myK9 Platform.

## Overview

`@myk9/ui` provides a complete design system and component library built on Base UI (from the creators of Material-UI). It ensures visual consistency and code reuse across both myK9Show and myK9Q applications with a modern, Apple-inspired aesthetic.

### Key Features

- Modern UI components built on Base UI (unstyled primitives)
- Tailwind CSS preset with design tokens and CSS variables
- Apple-inspired design language with smooth animations
- Full TypeScript support with prop types
- Dark mode support via CSS variables
- Accessible components following ARIA standards
- Class Variance Authority (CVA) for variant management

## Installation

This package is part of the myK9 Platform monorepo:

```bash
pnpm install
```

## Quick Start

### 1. Import Styles and Configure Tailwind

In your app's entry point (e.g., `main.tsx`):

```typescript
import '@myk9/ui/styles';
```

In your `tailwind.config.ts`:

```typescript
import { myk9Preset } from '@myk9/ui/tailwind-preset';

export default {
  presets: [myk9Preset],
  content: [
    './src/**/*.{ts,tsx}',
    './node_modules/@myk9/ui/dist/**/*.js',
  ],
  // ... rest of config
};
```

### 2. Use Components

```typescript
import { Button, Card, Badge, Dialog } from '@myk9/ui';

function MyComponent() {
  return (
    <Card>
      <h2>Welcome</h2>
      <Badge variant="success">Active</Badge>
      <Button variant="primary" size="lg">
        Get Started
      </Button>
    </Card>
  );
}
```

### 3. Use Utility Functions

```typescript
import { cn } from '@myk9/ui';

// Merge className strings with proper precedence
const className = cn(
  'base-class',
  isActive && 'active-class',
  customClassName
);
```

## Components

### UI Primitives

#### Button

Versatile button component with multiple variants and sizes.

```typescript
import { Button } from '@myk9/ui';

<Button variant="primary" size="lg">
  Primary Action
</Button>

<Button variant="secondary" size="md">
  Secondary
</Button>

<Button variant="destructive" size="sm">
  Delete
</Button>

<Button variant="ghost">
  Cancel
</Button>
```

**Variants:**
- `primary` - Primary action button (blue)
- `secondary` - Secondary action button (gray)
- `destructive` - Destructive action (red)
- `ghost` - Minimal styling
- `link` - Link-like button

**Sizes:**
- `sm` - Small (32px height)
- `md` - Medium (40px height, default)
- `lg` - Large (48px height)

#### Badge

Status badges for displaying states and categories.

```typescript
import { Badge } from '@myk9/ui';

<Badge variant="success">Qualified</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="error">Failed</Badge>
<Badge variant="info">In Progress</Badge>
<Badge variant="default">Draft</Badge>
```

**Variants:**
- `default` - Neutral gray badge
- `success` - Green badge (qualified, approved)
- `warning` - Orange badge (pending, at-gate)
- `error` - Red badge (failed, rejected)
- `info` - Blue badge (in-ring, processing)

#### Card

Container component for grouping related content.

```typescript
import { Card } from '@myk9/ui';

<Card>
  <h3>Card Title</h3>
  <p>Card content goes here</p>
</Card>

<Card className="p-6 hover:shadow-card-hover">
  Custom styled card
</Card>
```

#### Dialog

Modal dialog component with overlay and backdrop.

```typescript
import { Dialog } from '@myk9/ui';

<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <Dialog.Trigger asChild>
    <Button>Open Dialog</Button>
  </Dialog.Trigger>

  <Dialog.Portal>
    <Dialog.Backdrop />
    <Dialog.Popup>
      <Dialog.Title>Dialog Title</Dialog.Title>
      <Dialog.Description>
        Dialog description text
      </Dialog.Description>

      <div className="dialog-content">
        {/* Dialog content */}
      </div>

      <Dialog.Close asChild>
        <Button variant="ghost">Close</Button>
      </Dialog.Close>
    </Dialog.Popup>
  </Dialog.Portal>
</Dialog>
```

#### Sheet

Side sheet component for slide-in panels.

```typescript
import { Sheet } from '@myk9/ui';

<Sheet open={isOpen} onOpenChange={setIsOpen}>
  <Sheet.Trigger asChild>
    <Button>Open Sheet</Button>
  </Sheet.Trigger>

  <Sheet.Portal>
    <Sheet.Backdrop />
    <Sheet.Content side="right">
      <Sheet.Title>Sheet Title</Sheet.Title>
      <Sheet.Description>
        Sheet description
      </Sheet.Description>

      {/* Sheet content */}

      <Sheet.Close asChild>
        <Button>Close</Button>
      </Sheet.Close>
    </Sheet.Content>
  </Sheet.Portal>
</Sheet>
```

**Sides:** `left`, `right`, `top`, `bottom`

#### Input

Text input component with validation states.

```typescript
import { Input } from '@myk9/ui';

<Input
  type="text"
  placeholder="Enter name"
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>

<Input
  type="email"
  placeholder="Email"
  error="Invalid email address"
/>
```

#### Tabs

Tab navigation component.

```typescript
import { Tabs } from '@myk9/ui';

<Tabs defaultValue="tab1">
  <Tabs.List>
    <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
    <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
    <Tabs.Trigger value="tab3">Tab 3</Tabs.Trigger>
  </Tabs.List>

  <Tabs.Content value="tab1">
    Content 1
  </Tabs.Content>
  <Tabs.Content value="tab2">
    Content 2
  </Tabs.Content>
  <Tabs.Content value="tab3">
    Content 3
  </Tabs.Content>
</Tabs>
```

### Domain Components

#### StatusBadge

Specialized badge for class/entry status display.

```typescript
import { StatusBadge } from '@myk9/ui';

<StatusBadge status="pending" />
<StatusBadge status="in_progress" />
<StatusBadge status="completed" />
<StatusBadge status="cancelled" />
```

#### TimerDisplay

Formatted timer display with warning states.

```typescript
import { TimerDisplay } from '@myk9/ui';

<TimerDisplay
  time="2:30.45"
  maxTime="3:00"
  state="normal"
/>

<TimerDisplay
  time="2:50.00"
  maxTime="3:00"
  state="warning"
/>

<TimerDisplay
  time="3:05.00"
  maxTime="3:00"
  state="expired"
/>
```

#### ClassCard

Display card for class information.

```typescript
import { ClassCard } from '@myk9/ui';

<ClassCard
  className="Novice A Container"
  status="in_progress"
  entryCount={12}
  scoredCount={8}
  onSelect={() => handleSelect()}
/>
```

#### PageLayout

Standard page layout with header and content area.

```typescript
import { PageLayout } from '@myk9/ui';

<PageLayout
  title="Classes"
  subtitle="Novice Trial"
  actions={
    <Button onClick={handleAdd}>Add Class</Button>
  }
>
  {/* Page content */}
</PageLayout>
```

#### TabBar

Mobile-optimized tab bar navigation.

```typescript
import { TabBar } from '@myk9/ui';

<TabBar>
  <TabBar.Tab
    label="All"
    icon={<ListIcon />}
    isActive={tab === 'all'}
    onClick={() => setTab('all')}
  />
  <TabBar.Tab
    label="In Ring"
    icon={<CircleIcon />}
    isActive={tab === 'in-ring'}
    onClick={() => setTab('in-ring')}
    badge={3}
  />
</TabBar>
```

## Tailwind Preset

### Design Tokens

The preset provides comprehensive design tokens via CSS variables:

#### Colors

```typescript
// Base colors
background
foreground
background-alt

// Card colors
card
card-secondary
card-foreground

// Semantic colors
primary
primary-foreground
secondary
secondary-foreground
accent
destructive
success
warning
error

// Status colors
status-pending
status-approved
status-rejected
status-checked-in
status-at-gate
status-in-ring
status-scored
```

#### Typography

```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", ...
```

#### Border Radius

```css
--radius: 0.5rem;
border-radius: var(--radius);
border-radius: calc(var(--radius) - 2px); /* md */
border-radius: calc(var(--radius) - 4px); /* sm */
```

#### Shadows

```css
shadow-card: 0 1px 3px rgba(0, 0, 0, 0.04);
shadow-card-hover: 0 12px 32px rgba(0, 0, 0, 0.08);
shadow-dialog: 0 24px 48px rgba(0, 0, 0, 0.15);
shadow-button: 0 4px 12px rgba(0, 122, 255, 0.3);
```

#### Animations

```css
/* Built-in animations */
animate-fade-in
animate-fade-out
animate-slide-in-from-top
animate-slide-in-from-bottom
animate-sheet-slide-in
animate-sheet-slide-out
animate-accordion-down
animate-accordion-up
animate-shimmer
```

### Custom Timing Functions

```css
transition-apple: cubic-bezier(0.25, 0.46, 0.45, 0.94);
transition-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275);
```

## Utilities

### cn() - Class Name Merger

Intelligently merges className strings with proper Tailwind precedence.

```typescript
import { cn } from '@myk9/ui';

// Basic usage
const className = cn('px-4 py-2', 'bg-blue-500');
// Result: "px-4 py-2 bg-blue-500"

// Conditional classes
const className = cn(
  'base-class',
  isActive && 'active-class',
  isDisabled && 'disabled-class'
);

// Override with proper precedence
const className = cn(
  'bg-blue-500 text-white',
  variant === 'danger' && 'bg-red-500'
);
// Result: "text-white bg-red-500" (bg-red-500 overrides bg-blue-500)

// Merge with component props
function MyComponent({ className }: { className?: string }) {
  return (
    <div className={cn('default-styles', className)}>
      {/* className prop overrides defaults */}
    </div>
  );
}
```

**Implementation:** Uses `clsx` for conditional classes and `tailwind-merge` for intelligent Tailwind class merging.

## Package Structure

```
packages/ui/
├── src/
│   ├── components/
│   │   ├── Badge/
│   │   │   ├── Badge.tsx
│   │   │   ├── badgeVariants.ts     # CVA variants
│   │   │   └── index.ts
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   ├── buttonVariants.ts
│   │   │   └── index.ts
│   │   ├── Card/
│   │   ├── Dialog/
│   │   ├── Input/
│   │   ├── Sheet/
│   │   ├── Tabs/
│   │   ├── ClassCard/
│   │   ├── StatusBadge/
│   │   ├── TimerDisplay/
│   │   ├── PageLayout/
│   │   ├── TabBar/
│   │   └── index.ts
│   ├── styles/
│   │   └── index.css              # CSS variables and base styles
│   ├── utils/
│   │   └── cn.ts                  # Class name utility
│   ├── tailwind-preset.ts         # Tailwind preset
│   └── index.ts                   # Public API
├── dist/                          # Built files
├── package.json
└── README.md
```

## API Reference

### Components

All components are exported from the main package entry:

```typescript
// UI Primitives
export { Button, type ButtonProps } from './Button';
export { Badge, type BadgeProps } from './Badge';
export { Card, type CardProps } from './Card';
export { Dialog } from './Dialog';
export { Sheet } from './Sheet';
export { Input, type InputProps } from './Input';
export { Tabs } from './Tabs';

// Domain Components
export { StatusBadge, type StatusBadgeProps } from './StatusBadge';
export { TimerDisplay, type TimerDisplayProps } from './TimerDisplay';
export { ClassCard, type ClassCardProps } from './ClassCard';
export { PageLayout, type PageLayoutProps } from './PageLayout';
export { TabBar } from './TabBar';
```

### Utilities

```typescript
export { cn } from './utils/cn';
```

### Tailwind Preset

```typescript
export { myk9Preset } from './tailwind-preset';
```

## Usage Examples

### Complete Form Example

```typescript
import { Card, Input, Button, Dialog } from '@myk9/ui';

function AddDogForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('');

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Trigger asChild>
        <Button variant="primary">Add Dog</Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.Title>Add New Dog</Dialog.Title>

          <Card className="p-4 space-y-4">
            <Input
              type="text"
              placeholder="Dog name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <Input
              type="text"
              placeholder="Breed"
              value={breed}
              onChange={(e) => setBreed(e.target.value)}
            />

            <div className="flex gap-2">
              <Button variant="primary" onClick={handleSave}>
                Save
              </Button>
              <Dialog.Close asChild>
                <Button variant="ghost">Cancel</Button>
              </Dialog.Close>
            </div>
          </Card>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog>
  );
}
```

### Status Dashboard Example

```typescript
import { Card, Badge, StatusBadge, ClassCard } from '@myk9/ui';

function ClassDashboard({ classes }: { classes: Class[] }) {
  return (
    <div className="grid gap-4">
      {classes.map((cls) => (
        <ClassCard
          key={cls.id}
          className={cls.name}
          status={cls.status}
          entryCount={cls.entry_count}
          scoredCount={cls.scored_count}
          onSelect={() => navigate(`/class/${cls.id}`)}
        />
      ))}
    </div>
  );
}
```

### Responsive Layout Example

```typescript
import { PageLayout, TabBar, Button } from '@myk9/ui';

function TrialPage() {
  const [tab, setTab] = useState('all');

  return (
    <PageLayout
      title="Novice Trial"
      subtitle="January 15, 2024"
      actions={
        <Button variant="primary">
          Add Class
        </Button>
      }
    >
      <TabBar>
        <TabBar.Tab
          label="All"
          isActive={tab === 'all'}
          onClick={() => setTab('all')}
        />
        <TabBar.Tab
          label="In Progress"
          isActive={tab === 'in-progress'}
          onClick={() => setTab('in-progress')}
          badge={3}
        />
        <TabBar.Tab
          label="Completed"
          isActive={tab === 'completed'}
          onClick={() => setTab('completed')}
        />
      </TabBar>

      {/* Tab content */}
    </PageLayout>
  );
}
```

## Development

### Building

```bash
# Build once
pnpm build

# Watch mode
pnpm dev
```

### Type Checking

```bash
pnpm typecheck
```

### Cleaning

```bash
pnpm clean
```

## Dependencies

### Runtime Dependencies

- **@base-ui/react** (^1.1.0) - Unstyled UI primitives
- **class-variance-authority** (^0.7.1) - Variant management
- **clsx** (^2.1.1) - Conditional className utility
- **tailwind-merge** (^3.4.0) - Tailwind class merging

### Peer Dependencies

- **react** (^18.2.0 or ^19.0.0)
- **react-dom** (^18.2.0 or ^19.0.0)

### Dev Dependencies

- **tailwindcss** (^4.1.18)
- **tailwindcss-animate** (^1.0.7)
- **typescript** (^5.9.3)
- **tsup** (^8.5.1)

## Used By

- **@myk9/show** - myK9Show application
- **@myk9/scoring-ui** - Scoring UI components
- Both apps use the shared design system for consistent UX

## Contributing

When contributing to `@myk9/ui`:

1. **Follow Base UI patterns** - Extend Base UI components, don't replace them
2. **Use CVA for variants** - Create variant files for component variations
3. **CSS variables for theming** - Use design tokens, not hardcoded colors
4. **Mobile-first responsive** - Base styles for mobile, enhance for desktop
5. **Accessibility first** - Follow ARIA standards and keyboard navigation
6. **Type everything** - Export prop types for all components
7. **Document props** - Add JSDoc comments for component props

### Adding a New Component

1. Create component folder in `src/components/`
2. Create component file (`ComponentName.tsx`)
3. Create variants file if needed (`componentVariants.ts`)
4. Export from folder `index.ts`
5. Export from `src/components/index.ts`
6. Export from `src/index.ts`
7. Update this README with usage examples
8. Build and test:
   ```bash
   pnpm build && pnpm typecheck
   ```

### Design System Changes

When updating the design system:

1. Update CSS variables in `src/styles/index.css`
2. Update Tailwind preset in `src/tailwind-preset.ts`
3. Test in both apps (myK9Show and myK9Q)
4. Document changes in this README

## Best Practices

### 1. Always Import Styles

```typescript
// In your app entry point (main.tsx)
import '@myk9/ui/styles';
```

### 2. Use the Tailwind Preset

```typescript
// tailwind.config.ts
import { myk9Preset } from '@myk9/ui/tailwind-preset';

export default {
  presets: [myk9Preset],
  // ...
};
```

### 3. Extend, Don't Override

```typescript
// Good: Extend with additional classes
<Button className="mt-4">Click Me</Button>

// Avoid: Overriding base styles
<Button className="bg-purple-500">Click Me</Button>
```

### 4. Use Variants

```typescript
// Good: Use built-in variants
<Button variant="destructive">Delete</Button>

// Avoid: Custom styling
<Button className="bg-red-500 text-white">Delete</Button>
```

### 5. Leverage cn() for Conditional Styles

```typescript
// Good: Clear conditional logic
<div className={cn(
  'base-class',
  isActive && 'active-class',
  size === 'lg' && 'large-class'
)}>
  Content
</div>
```

## Troubleshooting

### Styles Not Applying

1. Check that `@myk9/ui/styles` is imported in your app
2. Verify Tailwind preset is configured
3. Ensure content paths include `@myk9/ui` dist files
4. Clear Vite cache: `rm -rf node_modules/.vite`

### TypeScript Errors

1. Run `pnpm build` in the ui package
2. Check that `dist/` folder exists
3. Verify TypeScript version matches (^5.9.3)

### Dark Mode Not Working

1. Ensure CSS variables are defined for dark mode
2. Add `dark` class to root element
3. Check `darkMode: 'class'` in Tailwind config

## License

Private - myK9 Platform

## Support

For questions or issues related to `@myk9/ui`:
- Review this README and source code
- Check component examples in apps
- Consult project CLAUDE.md for patterns
- Ask in team chat

---

**Version:** 0.0.1
**Last Updated:** 2026-02-03
