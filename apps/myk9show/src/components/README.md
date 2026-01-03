# Components Directory Structure

## Feature-Based Organization
- Each major feature/tab (e.g., Competitions, Registrations, Title Progress) has its own folder under `src/components/`.
- Sub-features (e.g., Achievements) are organized within their parent feature folder for clarity and modularity.

## Example Structure
```
src/components/
  competitions/
    Achievements/
      AddAchievementDialog.tsx
      EditAchievementDialog.tsx
      AchievementDetailsDialog.tsx
      AchievementsSection.tsx
    UpcomingShowsSection.tsx
    PastResultsSection.tsx
    ...
  registrations/
    ...
  common/
    StandardDialog.tsx
    SectionCard.tsx
    ThreeDotMenu.tsx
    ...
```

## Component Modularity & Best Practices
- Each logical feature/section is a separate React component in its own file.
- UI and business logic for each feature are encapsulated within its folder.
- Shared components (dialogs, cards, menus) live in `common/`.

## UI/UX Conventions
- All major sections use a card-style container (`SectionCard`) with border, rounded corners, and padding.
- Row actions (View, Edit, Delete) use the shared `ThreeDotMenu` dropdown, not inline buttons/links.
- Use ShadCN components where possible for consistency.
- Maintain a list of used ShadCN components in `ShadCN-context.md`.

## Adding New Features
- Create a new folder under `src/components/` for each major feature/tab.
- Place all related components, dialogs, and logic within that folder.
- Use and extend shared components from `common/` as needed.

## Notes
- Follow TypeScript and React best practices for maintainability and scalability.
- Keep imports clean and update paths if you move components.
- See `ShadCN-context.md` for a list of adopted ShadCN components.
