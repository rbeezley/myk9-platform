# PWA Update Toast Design

**Date:** 2025-12-10

## Problem

When a new app version is available, users see a jarring browser `confirm()` dialog. This is:
- Visually inconsistent with the app
- Blocks the UI
- Unprofessional

## Solution

Replace `confirm()` with a styled toast notification at the bottom of the screen.

## Design Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Position | Bottom of screen | Consistent with existing success toasts |
| Persistence | Never auto-dismiss | Updates are rare and important |
| Buttons | "Update Now" + "Later" | Gives user control without being pushy |
| Scoresheet protection | Defer until user navigates away | Don't interrupt active scoring |
| Message | "myK9Q has been updated! Tap to load new features" | Positive framing encourages updates |
| Styling | Teal accent border | Distinguishes from content notifications |
| Integration | Separate React root in main.tsx | Isolated from main app, no context needed |
| "Later" behavior | Dismisses, reappears next session | Ensures users eventually update |

## Component: UpdateToast

### Props
```tsx
interface UpdateToastProps {
  onUpdate: () => void;
  onLater: () => void;
}
```

### Visual Structure
- Container: fixed bottom, full width with padding, z-index above content but below modals
- Card: white background, rounded corners, 4px teal left border, subtle shadow
- Layout: refresh icon left, message center, buttons right
- Buttons: "Update Now" (primary teal), "Later" (secondary text)

### Accessibility
- `role="alertdialog"` with `aria-labelledby`
- "Later" button gets initial focus (prevent accidental refresh)
- Respects `prefers-reduced-motion`

## Files

| File | Action |
|------|--------|
| `src/components/ui/UpdateToast.tsx` | Create |
| `src/components/ui/UpdateToast.css` | Create |
| `src/main.tsx` | Modify - replace confirm() with toast |
| `index.html` | Modify - add #update-toast-root div |

## Implementation Notes

### Scoresheet Deferral Logic
```tsx
const isOnScoresheet = () =>
  window.location.pathname.includes('/score') ||
  window.location.pathname.includes('/entry/');

// Poll every 2 seconds until user leaves scoresheet
if (isOnScoresheet()) {
  const interval = setInterval(() => {
    if (!isOnScoresheet()) {
      clearInterval(interval);
      showToast();
    }
  }, 2000);
} else {
  showToast();
}
```

### Toast Rendering
Uses separate `ReactDOM.createRoot` to render into `#update-toast-root`, keeping it isolated from the main React app tree.
