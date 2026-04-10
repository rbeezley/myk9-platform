Shows

can you review the shows page UI\UX and make recommendations on how to improve it?

Based on my comprehensive review of the Shows page, here are my UI/UX recommendations organized by priority:

Shows Page UI/UX Review & Recommendations
Current Strengths
Apple-inspired design with smooth animations and blur effects
Role-based dynamic tabs that adapt to user permissions
Three view modes (grid, list, calendar) with persistence
Comprehensive filtering system
Context-aware empty states for each tab
High Priority Recommendations
1. Simplify the Filter Section
Current Issue: The 6-filter grid can overwhelm users, especially on first visit.

Recommendation:

Move filters into a collapsible panel (collapsed by default)
Show only the search bar prominently, with a "Filters" button to expand
Add filter chips/pills below the search to show active filters visually
Before: [Search] [Discipline] [Entry Status] [Date] [Location] [Clear]
After:  [Search...🔍] [Filters ▼]
        Active: [Agility ×] [Open ×] [This Month ×]

2. Improve Card Information Hierarchy
Current Issue: Grid cards (.apple-browse-card) show all information equally weighted.

Recommendations:

Make the show name more prominent (increase from 18px to 22px)
Add a hero image or discipline icon at top of card to create visual distinction
Group related info: Date + Location together, then Entry info
Add urgency indicators more prominently (e.g., "Closes in 3 days" as a ribbon)
Suggested Card Layout:

┌────────────────────────────┐
│ [AGILITY] [CLOSING SOON]   │  ← Badges top-left
├────────────────────────────┤
│ Rocky Mountain KC Trial    │  ← Larger title
│ Rally, Obedience          │  ← Events subtitle
│                           │
│ 📅 Jan 25-26, 2026        │
│ 📍 Denver, CO             │
│ 💰 $35 entry fee          │
│                           │
│ ⏰ Entries close Jan 20   │  ← Urgency callout box
├────────────────────────────┤
│ [Upcoming]  [Enter Show →] │
└────────────────────────────┘

3. Consolidate Redundant UI Elements
Current Issues:

Two "Clear Filters" buttons (one in card header, one in filter row)
View mode toggle duplicates some calendar functionality with header button
Tab badge counts could be visually noisy
Recommendations:

Remove the "Clear All" button in CardHeader; keep only the one in the filter row
Consider removing the "View in Calendar" header button (redundant with Calendar view mode)
Show badge counts only for tabs with non-zero counts, or only on hover
4. Improve Mobile Experience
Current Issues at BrowseShowsPage.tsx:1022-1057:

View mode toggle labels hidden on mobile but icons alone aren't clear
Filter grid collapses but still shows all 6 dropdowns
Recommendations:

Use tooltips on mobile for view mode icons
On mobile, collapse filters into a bottom sheet or modal
Make "Enter Show" the primary (larger) CTA on mobile cards
Consider a "Pull to refresh" pattern for the show list
Medium Priority Recommendations
5. Enhanced Visual Feedback for Entry Status
Current: EntryStatusBadge shows status as text badges.

Recommendation: Add visual urgency cues:

Closing Soon: Add pulsing animation or red/orange border on card
Submitted: Add green checkmark overlay on card
Closed: Gray out card slightly or reduce opacity
6. Improve List View Information Density
Current Issue at lines 458-546: List view shows same info as grid, just horizontally.

Recommendations:

Add more metadata in list view (entry count, capacity remaining)
Show judge names in list view for judge-relevant tabs
Add inline quick actions (favorite, share) in list view
7. Better Empty State Illustrations
Current: Empty states use Lucide icons which feel generic.

Recommendation:

Consider custom illustrations for empty states
Add more specific guidance based on context:
"No shows in your area? Try expanding the location filter" (with button)
For new users: "New to dog shows? Start with a local trial to get familiar"
8. Add Quick Stats Summary
Recommendation: Add a summary bar below tabs:

┌─────────────────────────────────────────────────────────┐
│ 📊 12 upcoming shows • 3 entries pending • 2 closing soon │
└─────────────────────────────────────────────────────────┘

This gives users context without scanning all cards.

Lower Priority (Nice-to-Have)
9. Implement "Saved Searches"
Allow users to save filter combinations for quick access:

"Shows near me this month"
"Agility trials I can enter"
10. Add Map View Mode
For location-based discovery, a 4th view mode showing shows on a map would be valuable, especially for users willing to travel.

11. Improve Tab Switching Animation
Current: 300ms skeleton flash on tab switch feels abrupt.

Recommendation: Use a crossfade or slide animation between tab contents for smoother transitions.

12. Keyboard Navigation
Add keyboard shortcuts for power users:

g - Grid view
l - List view
c - Calendar view
/ - Focus search
1-5 - Switch tabs
Accessibility Improvements
Focus Management: Ensure focus moves logically when tabs change
Screen Reader Labels: Add aria-label to icon-only buttons (view mode toggles)
Color Contrast: Verify entry status badges meet WCAG AA contrast (especially "Closing Soon" yellow)
Reduced Motion: Respect prefers-reduced-motion for card hover animations
Summary Matrix
Recommendation	Impact	Effort	Priority
Collapsible filter panel	High	Medium	High
Card hierarchy improvements	High	Low	High
Remove redundant Clear buttons	Medium	Low	High
Mobile filter bottom sheet	High	Medium	High
Entry status visual cues	Medium	Low	Medium
List view improvements	Medium	Medium	Medium
Empty state illustrations	Low	Medium	Low
Quick stats summary	Medium	Low	Medium
Map view mode	High	High	Low
Keyboard shortcuts	Low	Low	Low
