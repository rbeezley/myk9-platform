Trials

can you review the trials page UI\UX and make recommendations on how to improve it?

Trials Page UI/UX Review
Current Implementation Summary
The trials page uses a two-column layout with:

Left sidebar: Grouped trial list (Upcoming, In Progress, Completed)
Main content: Trial info card, statistics cards (4), and classes table/cards
Issues & Recommendations
1. Statistics Cards - Misleading Data Display
Issue: The statistics show "percent change" values (e.g., +0%, +75%) that don't make sense in context - trials don't have historical comparisons.

Location: TrialDetailsMain.tsx:73-110

Recommendation: Replace "percent change" with more useful metrics:

Judges: Show assignment status (e.g., "2 assigned, 1 pending")
Classes: Show progress ratio (e.g., "3 of 12 completed")
Entries: Show check-in status (e.g., "45 checked in")
Qualified Rate: Keep as-is, but only show when there's completed data
2. Trial Info Card - Field Relevance
Issue: The 6-field grid shows "Order" which has low user value, and "Event Number" which may be redundant with "Trial Number".

Location: TrialDetailsMain.tsx:152-188

Recommendation:

Remove "Order" field (internal use only)
Combine Trial Number/Event Number if they serve similar purposes
Add more useful fields: "Total Classes", "Registration Status", or "Secretary Notes"
3. Collapsed Sidebar - Poor Scannability
Issue: When collapsed, trials show only 1-2 character abbreviations (TrialSidebar.tsx:98-106) which don't provide enough context.

Recommendation:

Show trial date in collapsed mode instead of type abbreviation
Add tooltip on hover with full trial info
Consider showing a small colored dot for status
4. Empty State Improvements
Issue: The "No classes yet" empty state is functional but could drive action better.

Location: TrialClassesTable.tsx:116-132

Recommendation:

Add an illustration/icon
Include a secondary action (e.g., "Import from another trial")
Show benefit text (e.g., "Add classes to start managing entries")
5. Missing Quick Navigation
Issue: Users must use sidebar to switch between trials - no quick prev/next navigation.

Recommendation: Add trial navigation arrows in the header:

← Previous Trial | Interior Search | Next Trial →

6. Classes Table - Missing Features
Issues:

No pagination for large class lists
No bulk actions (select multiple → delete/assign judge)
Search placeholder is too long on mobile
Location: TrialClassesTable.tsx:186-195

Recommendations:

Add pagination when classes > 10
Add select-all checkbox for bulk operations
Shorten search placeholder to "Search classes..."
7. Status Badge - Visual Impact
Issue: Status badges are subtle - "In Progress" should be more prominent during active trials.

Location: apple-show-details.css:88-92

Recommendation: Add animation pulse to "In Progress" status:

.apple-show-status-in-progress {
  animation: pulse 2s infinite;
}

8. Mobile Responsiveness Issues
Issues:

Statistics cards stack to single column but lose context
Sidebar toggle isn't obvious on mobile
Table view is cramped on small screens
Recommendations:

Default to card view on mobile
Add a floating sidebar toggle button
Reduce statistics to 2 most important cards on mobile
9. Action Discovery
Issue: Edit/Delete trial are hidden in dropdown menu - users may not discover them.

Location: TrialDetailsMain.tsx:129-149

Recommendation:

Move "Edit" to a visible icon button alongside the dropdown
Keep "Delete" in dropdown (destructive actions should require extra step)
10. Add Classes Button Placement
Issue: "Add Classes" button only appears after classes exist - duplicated in header and empty state.

Recommendation:

Always show the button in the section header
Make it a primary action with icon + text
Priority Matrix
Priority	Issue	Impact	Effort
High	Statistics misleading data	User confusion	Medium
High	Mobile responsiveness	Usability	Medium
Medium	Trial navigation	Efficiency	Low
Medium	Empty state improvement	Engagement	Low
Medium	Sidebar collapsed view	Usability	Low
Low	Bulk actions	Power users	High
Low	Pagination	Scale	Medium