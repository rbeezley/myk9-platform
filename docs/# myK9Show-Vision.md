# myK9Show — Brainstorming Session
**Date:** February 23, 2025  
**Participants:** Richard Beezley, Claude (Anthropic)  
**Topic:** Secretary Dashboard UX, Competitive Analysis, Platform Strategy

---

## 1. The Core UX Problem We Set Out to Solve

The session began with an observation from a competitive analysis of Secreterrier, a rival dog show management platform. The central weakness identified was that the software gave secretaries no sense of process — no guidance about what to do next, what order things should happen in, or what was blocking progress. The software was organized around *features*, not around the secretary's *job*.

The insight: trial secretaries don't think in modules. They think in sequence. First you create the show. Then you create the trials. Then you create the classes. Then entries open. Then you score. Then you produce results. The UI should reflect that mental model, not fight against it.

---

## 2. The Process Pipeline / Kanban Dashboard Concept

### The Idea
Rather than a traditional feature-menu dashboard, the myK9Show secretary dashboard should present the trial lifecycle as a visible pipeline — a left-to-right progression of stages that shows the secretary exactly where they are, what's done, and what comes next.

### The Six Stages
The pipeline flows through these stages in order:

1. **Trial Setup** — Trial name, dates, location, judges, entry dates, premium list
2. **Classes & Elements** — Class creation, element assignment, run order and limits
3. **Entry Period** — Portal activation, confirmation emails, waitlist rules, entry verification, closing entries
4. **Scoring Day** — Run sheets, armbands, scoring all classes, score review
5. **Results & Reports** — Results generation, awards, AKC export, submission, archiving
6. **Closed** — Trial complete and archived

### Key Design Principles

**The GPS metaphor.** The dashboard shows the next turn, not the entire map. The full feature set remains accessible, but the secretary is never left wondering what to do next.

**Blocking logic.** The advance button to the next stage only activates when all required checklist items are complete. If a secretary tries to advance before finishing, the system tells them *exactly* what is preventing progress — not a silent failure, not an empty error, but a specific human-readable message.

**Checklist items are navigation, not just tracking.** Each item in the checklist is a live link that opens the relevant form or workflow panel directly. The secretary never has to hunt through menus. Completing the form auto-checks the item.

**Completed stages remain browsable.** Secretaries can click back to review any previous stage. A "return to current stage" prompt keeps them oriented.

---

## 3. The Interactive Prototype

A fully interactive React prototype was built during this session demonstrating the complete concept. It includes all six pipeline stages, clickable checklist items that open slide-over panels with mock forms for every task, auto-completion of checklist items when forms are saved, blocking logic on the advance button, and a special Scoring Day view (described below).

The prototype is available as `myk9show-dashboard.jsx` and renders directly in the Claude.ai chat window. It is designed to serve as a blueprint for the real implementation — the component structure and interaction patterns translate directly into production React code.

---

## 4. Handling Multiple Simultaneous Classes on Scoring Day

### The Problem
Scoring Day is fundamentally different from every other stage. While Trial Setup and Entry Period are largely sequential, Scoring Day involves multiple classes running in parallel across multiple rings, with scoresheets trickling in at unpredictable intervals from different sources.

### The Solution: Two Modes

**Scoring Overview (the big picture).** A card grid showing one card per class, each with a live progress bar, entry count, and input mode indicator. The secretary sees at a glance how all simultaneous classes are progressing without needing to open any of them.

**Class Scoring Panel (the work tool).** A focused, keyboard-optimized entry interface for a single class. Dogs are listed in run order. Time, faults, and Q/NQ/ABS/EXC fields are designed for fast tabbing through a stack of paper scoresheets. Progress saves immediately and partially — the secretary can come back as more sheets arrive.

### The myK9Q Integration
myK9Show has a companion ringside scoring app called myK9Q. When a judge uses it, scores sync into myK9Show automatically and appear in the Scoring Overview in real time (simulated in the prototype with live score trickles every few seconds). When a judge refuses to use myK9Q, the secretary switches that class to Manual Entry mode and enters paper scoresheets herself. The pipeline handles both modes gracefully — both write to the same Supabase tables, and the dashboard doesn't care which method was used.

**Override capability.** Even on myK9Q-synced classes, every field remains editable by the secretary. If a judge corrects a score after the fact, the secretary's manual change takes precedence. This is communicated clearly in the UI.

### The Parallel Gate
The advance button to Results only unlocks when every class reaches 100% and a review step is confirmed. The exact number of classes still in progress is shown in the blocker message.

---

## 5. Handling Process Forks and Multiple Paths

Four categories of workflow variation were identified, each with a distinct design solution.

**Optional steps** (e.g., buried element not offered) are handled through *conditional checklist generation*. The trial configuration set during setup determines which checklist items appear in later stages. Irrelevant items simply don't show up — the secretary never has to skip or dismiss them.

**Exception paths** (e.g., a judge gets sick, an entry has a conflict) are surfaced as *side-lane tasks* inside the main pipeline rather than separate parallel workflows. A blocking exception appears inline and must be resolved before the secretary can advance, but the overall pipeline structure remains unchanged.

**True decision forks** (e.g., single-day vs. multi-day trials) are handled through *stage variants*. The trial type is captured during setup and determines which version of the pipeline configuration loads. The secretary sees a pipeline suited to their specific situation without any visible complexity.

**Parallel background tasks** (things that should happen during a stage but don't block progression) are visually distinguished from blocking items. Blocking items prevent advancement. Background items are softer in appearance and tracked without creating hard gates.

---

## 6. The Create Show Wizard Integration

The existing Create Show Wizard in myK9Show should be preserved and reused — it solves the right problem (creating something new from a blank slate) and represents real design work. The key enhancement needed is a clean handoff: when the wizard completes, it should navigate directly into the pipeline dashboard at the Trial Setup stage, with wizard-completed items already checked off. This makes the wizard feel like the natural beginning of the pipeline rather than a separate isolated tool.

After initial creation, individual setup items should be editable through the targeted slide-over panels in the dashboard rather than requiring the full wizard to be re-run.

---

## 7. Competitive Analysis — Secreterrier

Twenty screenshots of Secreterrier (secreterrier.com) were analyzed. Key findings are summarized below.

### Their Strengths Worth Learning From

**Scoring interface design.** The split-panel layout (dog list left, scoring entry right) is well-executed. The Standard Course Time display with automatic Q/NQ calculation on time entry is a thoughtful touch. Class tabs across the top allow class-switching without losing context.

**Pawprints activity log.** A real-time timestamped audit feed of every system action (scores entered, entries modified, etc.). Labeled Beta, suggesting it was added in response to real user feedback. Gives secretaries confidence that data is saving correctly and provides clubs with a complete audit trail. Worth adding to the myK9Show roadmap.

**MRV-based capacity limits.** Rather than counting raw entry numbers, Secreterrier uses MRV (likely Maximum Run Value) — a weighted capacity system where different class types consume different amounts of ring time. Progress bars turn red when limits are exceeded. More sophisticated than head counts for large multi-ring trials.

**Dog Sizes screen.** Under Prep, a dedicated screen assigns S/M/L container size per dog. Practical for Scent Work ring setup. Should be added to myK9Show's Prep stage.

**Printout granularity.** Scribesheets available blank (not pre-filled) or populated, organized by trial day and class. An "All Classes" button per day prints everything at once. Supports both the digital and paper-fallback workflows simultaneously.

**Financial tracking.** Club Net Total displayed prominently. Per-user payment breakdowns with running balances for credits and refunds. Bulk "Refund+Scratch All" for waitlisted entries saves significant manual work.

**Promo codes and comped entries.** Percentage and fixed-amount discount codes (e.g., RESTROOM for 100% off for facilities workers, WORKER for $5 off). Comped entry grants for volunteers. A real operational need that myK9Show should address.

### Their Central Weakness

The navigation is a flat feature list: About, Configure, Emails, Entries, Prep, Results, Score, Limits, Pawprints. Every item has equal visual weight. There is no implied order, no "you are here" indicator, no guidance about what to do first or what comes next. A first-time secretary has no map. This is the gap that myK9Show's pipeline dashboard directly and completely addresses.

### Important Context
The screenshots were from a **Barn Hunt** trial, not a Scent Work trial. Secreterrier's primary user base is Barn Hunt. The class names (Instinct, Novice, Open, Senior, Master, Crazy8s), the MRV system, and some operational details are Barn Hunt-specific and may not translate directly to Scent Work. The UX observations remain valid across sports.

---

## 8. Multi-Sport Architecture

### The Strategic Situation
myK9Show and Secreterrier are not currently in direct head-to-head competition. Secreterrier's DNA is Barn Hunt; myK9Show's DNA is AKC Scent Work. However, Secreterrier is clearly moving toward multi-sport support, and myK9Show should do the same — thoughtfully.

### The Template System
Richard had already identified the right architectural solution: a template system that separates the universal platform layer from the sport-specific layer. The platform knows how to run a trial. The template tells it which sport's rules to apply.

A complete sport template needs to answer four questions:

**Identity and structure.** What is the sport called, what organization governs it, and what are the available classes and their hierarchy?

**Scoring rules.** What inputs does scoring require (time, faults, points, deductions)? How is Q/NQ or a score calculated? What is the standard course time or qualifying threshold? This should be expressed as a configurable rule set, not hardcoded logic.

**Operational requirements.** What day-of-show details are sport-specific? Dog size categories, element types, scribesheeet format, ring configuration requirements.

**Export format.** What file format or submission process does the governing organization require for results?

### How the Pipeline Relates to Templates
The pipeline stages (Setup, Classes, Entries, Scoring, Results) are universal and sport-agnostic. What populates those stages — which classes appear, which scoring fields show, which export button is present — comes from reading the sport template attached to that trial. The pipeline component never needs to be changed to add a new sport. Only a new template configuration needs to be written.

### Recommended Phased Approach
In the near term, dominate AKC Scent Work. Build the pipeline dashboard, perfect the myK9Q integration, nail the AKC export. Establish undisputed ownership of that market. Simultaneously, architect with multi-sport in mind — the `sport_type` field and template system add minimal overhead now but would be enormously expensive to retrofit later. Then expand to Barn Hunt as the natural first adjacency, leveraging the competitive intelligence gathered in this session.

---

## 9. The Exhibitor Platform and Premium Features

### The Two-Sided Marketplace
myK9Show is not just trial management software. It is a two-sided marketplace: trial secretaries on one side, exhibitors on the other. These two groups reinforce each other. Secretaries run trials on the platform, generating results data automatically. Exhibitors use the platform because their results are already there. More secretaries means more complete exhibitor history. More exhibitors creates pressure on clubs to use myK9Show. Each side makes the platform more valuable to the other.

### The Dog Profile as Strategic Center
The individual dog profile is the anchor point of the exhibitor value proposition. A comprehensive dog profile contains four layers of information that no competitor currently consolidates in one place.

The **competitive layer** includes every trial result across every sport, automatically populated as secretaries use the platform. Qualifying runs are highlighted. Titles earned are marked with the date achieved. The complete career timeline from first entry to present is always current.

The **health layer** includes vaccination records, OFA results, genetic screening — information that serious exhibitors currently track in scattered spreadsheets and paper files.

The **training layer** is a journal where handlers log sessions, note what the dog is working on, track milestones, and flag areas for improvement.

The **pedigree layer** connects the dog to its family tree. Over time, as related dogs accumulate on the platform, this could surface performance and health patterns across bloodlines — genuinely valuable to breeders and serious competitors.

### Premium Features to Monetize
The following features were identified as candidates for a premium subscription tier: advanced title tracking with rules intelligence (not just counting Qs, but understanding leg requirements, judge diversity requirements, and eligibility gates), performance statistics and trend analysis (Q rate by element, average time by class, year-over-year improvement), training journal, health records management, pedigree with connected performance data, and cross-sport career history.

### The Monetization Logic
Premium features in this model are subscription-appropriate because their value compounds over time. A dog owner with three years of training journals and health records in myK9Show has built something irreplaceable. The longer someone uses the platform, the more valuable their data becomes, and the stronger their reason to stay. The free tier (basic results history) gets exhibitors onto the platform and starts building their history. Upgrading to premium unlocks richer access to data they've already accumulated — a much easier sell than asking someone to pay upfront for an empty tool.

### Title Tracking Deserves Special Investment
AKC title tracking rules are genuinely complex: different qualifying requirements per class, legs must be earned at separate trial dates, some titles require performance under multiple judges, some have minimum score thresholds rather than just Q/NQ. A title tracking engine that actually understands these rules — showing not just "12 qualifying runs" but "next qualifying run under a new judge completes your third leg requirement" — would be a meaningful differentiator that serious competitors would pay for and recommend to others.

### The Network Effect and Word-of-Mouth Growth
Dog sports communities are tight-knit and highly networked. Serious competitors know each other nationally. When something genuinely useful enters their world, it spreads through training groups, club membership, and online communities quickly. The premium feature set — especially advanced statistics and intelligent title tracking — is exactly the kind of thing a dedicated competitor demonstrates to their training group. That organic referral dynamic is among the most valuable growth mechanisms available to a niche platform, and the features described here are designed to trigger it.

---

## 10. Key Decisions and Action Items

**Prototype.** The interactive dashboard prototype (`myk9show-dashboard.jsx`) is ready for review on PC. Evaluate stage names, checklist completeness, scoring panel field accuracy, and the myK9Q vs. manual entry distinction.

**Scoring Day redesign.** Implement the card grid overview with per-class progress bars as the Scoring Day stage rather than a linear checklist. Distinguish myK9Q-synced classes from manual entry classes visually.

**Create Show Wizard handoff.** Add return navigation from the wizard's final save to the pipeline dashboard, with wizard-completed items pre-checked.

**Sport template schema.** Define the base template structure covering identity, scoring rules, operational requirements, and export format. Implement `sport_type` on the trial record. Build the Scent Work template first, designed in a way that adding Barn Hunt requires only a new configuration object.

**Supabase checklist state.** Design a `trial_checklist_state` table (or equivalent) so pipeline progress persists across sessions. Secretaries who close their browser and return the next day should find everything exactly as they left it.

**Feature roadmap additions from competitive analysis.** Pawprints activity log, Dog Sizes screen in Prep, MRV-based capacity limits (evaluate for Scent Work applicability), blank vs. populated scribesheeet options, bulk waitlist management, promo codes and comped entries.

**Premium tier scoping.** Begin defining the data models needed to support title tracking, training journal, and health records. These can be built incrementally but need schema decisions made early to avoid costly retrofits.

---

## 11. The Positioning Statement That Emerged

By the end of this session, a clear strategic positioning had emerged for myK9Show:

*Secreterrier is the feature encyclopedia. myK9Show is the guided experience.*

Secreterrier has depth and breadth, but it leaves every secretary without a map. myK9Show gives every secretary a GPS — a clear view of where they are, what comes next, and exactly what is blocking progress. For the majority of trial secretaries who are not power users, that guidance is worth more than any individual feature. Combined with a multi-sport exhibitor platform that consolidates every dog's competitive history, health records, and training data in one place, myK9Show is not competing for the same users with the same product. It is building a better product for a larger and more loyal audience.

---

*Document generated from brainstorming session on February 23, 2025. Prototype file: `myk9show-dashboard.jsx`.*