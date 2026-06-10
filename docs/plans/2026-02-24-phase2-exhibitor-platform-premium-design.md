# Phase 2: Exhibitor Platform & Premium — Design Document

**Date:** February 24, 2026
**Status:** ✅ SHIPPED (audited 2026-06-09 — all capabilities live; see [2026-06-09-premium-launch-design.md](2026-06-09-premium-launch-design.md) for the audit table and launch decisions)
**Depends on:** Phase 1 (Multi-Sport Templates)
**Enables:** Revenue generation, exhibitor retention

---

## Overview

Phase 2 builds the exhibitor-facing side of the platform. Every handler who enters a trial gets a profile. The free tier shows what happened — results from trials run on the platform. The premium tier adds intelligence — title tracking, historical data entry, health records, training journals, and pedigree management.

Subscription is per person, not per dog. A handler with six dogs pays once.

---

## Free Tier: Competitive History (Results Log)

Auto-populated from platform scoring. No data entry required from the exhibitor.

### What the exhibitor sees per result

- Date, show name, trial (sport type)
- Class: element, level, section
- Result status: Q, NQ, ABS, EX, WD
- Time (if applicable)
- Faults and fault details
- Placement (if recorded)
- Judge name

### What the exhibitor does NOT see (free)

- Legs toward a title
- Title eligibility or progress
- Performance trends or statistics
- Comparisons across trials

The free tier is a factual record. It answers "what happened" but not "what does it mean."

---

## Premium Tier: Intelligence Layer

Premium unlocks five capabilities on top of the results log.

### 1. Title Tracking Engine

Rule-driven computation reading from `sport_titles` (Phase 1 schema). For each dog, the engine:

1. Reads all qualifying results (Q) from platform-scored and manually-entered trials
2. Groups by sport, element, and level
3. Counts legs against title requirements
4. Shows progress: "Container Novice: 2 of 3 legs earned"
5. Flags eligibility: "One more Q in Exterior Advanced earns SWA"
6. Tracks title supersession (earning SWE replaces SWA display)

The engine reads title definitions from the database — no hardcoded title logic. When a new sport template is added (Phase 1), its titles become trackable automatically.

#### Manual Result Entry

For historical legs earned at trials not run on the platform:

- Exhibitor enters: date, organization, show name, element, level, result (Q/NQ), time, placement
- Source field: `platform` (auto-populated) vs. `manual` (exhibitor-entered)
- Manual entries count toward title progress identically
- Future: organization result import via API (AKC, UKC)

### 2. Health Records

Per-dog health tracking for the serious exhibitor.

**Vaccinations:**
- Vaccine name, date administered, expiration date
- Reminder notifications before expiration
- Common presets: Rabies, DHPP, Bordetella, Leptospirosis

**OFA/Health Screenings:**
- Test type (hips, elbows, eyes, heart, patella, thyroid)
- Date, result, certification number
- Status: Normal, Carrier, Affected, Pending

**Genetic Screening:**
- Provider (Embark, Wisdom Panel, Paw Print Genetics)
- Test results with breed-specific markers

### 3. Training Journal

Session-by-session training log tied to specific dogs.

**Per entry:**
- Date, duration, location
- Sport/discipline tag
- What was worked on (free text)
- Assessment: Breakthrough / Solid / Needs Work / Regression
- Optional: link to a competition result ("trained this after NQ on 2/10")

**Milestones:**
- Manual markers: "First successful buried hide," "Passed mock trial"
- Auto-generated from title completions

### 4. Pedigree

Three-generation pedigree display with connected data.

**Per dog:**
- Registered name, call name, breed, registration numbers (AKC, UKC, ASCA)
- Sire and dam (linked to platform dogs if they exist)
- Date of birth, color, sex

**Connected data (when sire/dam are on platform):**
- View parent's titles, health clearances, competition history
- Sibling discovery (same sire+dam)

### 5. Performance Statistics

Aggregated views across a dog's competition history.

- Q rate by element, by level, by sport
- Average time vs. class average (when data available)
- Fault frequency analysis
- Progress timeline (legs earned over time)
- Comparison: this dog vs. breed average (future, requires sufficient data)

---

## Subscription Model

### Pricing Structure

- **Free:** Results log (auto-populated from platform trials)
- **Premium:** All five capabilities above

Per-person subscription. One price covers all dogs under that handler's profile.

### Technical Implementation

- Stripe integration already exists (Edge Functions for checkout, portal, upgrade)
- `subscriptions` table tracks: user_id, plan, status, stripe_customer_id, current_period_end
- Feature gating via `useSubscription()` hook checking plan status
- Graceful degradation: premium features show locked state with upgrade prompt, never hard errors

### Promo Codes & Comped Entries

Secretary-facing tools for trial management:

**Promo codes:**
- Code, discount type (percentage or flat), usage limit, expiration
- Applies at checkout during entry submission
- Tracks redemptions per code

**Comped entries:**
- Secretary marks specific entries as comped (judges, workers, special circumstances)
- Comped entries appear in financials with $0 fee and reason tag
- Does not affect scoring or results

---

## Bulk Waitlist Management

When a class reaches capacity, additional entries go to a waitlist.

**Secretary tools:**
- View waitlist per class, ordered by submission time
- Bulk promote: move top N entries from waitlist to confirmed
- Bulk notify: send waitlist status emails
- Auto-promote when withdrawals create openings (configurable)

**Exhibitor view:**
- Waitlist position visible in their entry status
- Notification when promoted to confirmed

---

## Financial Tracking [ADDED]

Secretary and club treasurer tools for trial finances.

**Per-trial financial summary:**
- Club net total (entry fees minus platform fees, refunds, comps)
- Entry count by payment status (paid, pending, refunded, comped)
- Per-exhibitor payment breakdown with running balances

**Operational tools:**
- Bulk refund + scratch for waitlisted entries that don't get promoted
- Credit tracking for exhibitors who withdraw (credits apply to future entries)
- Export financial summary as CSV for club bookkeeping

---

## Database Changes

### New tables

**`dog_health_records`** — type (vaccination/screening/genetic), dog_id, record_date, expiration_date, details (jsonb), created_by

**`training_journal_entries`** — dog_id, user_id, entry_date, duration_minutes, sport_tag, notes, assessment, linked_result_id

**`manual_results`** — dog_id, user_id, source ('manual'), organization, show_name, trial_date, element, level, result_status, time_seconds, placement, notes

**`pedigrees`** — dog_id, sire_dog_id, dam_dog_id, registered_name, registration_numbers (jsonb), date_of_birth, breed, color, sex

**`subscriptions`** — user_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end

**`promo_codes`** — code, discount_type, discount_value, usage_limit, usage_count, expires_at, created_by

**`waitlist_entries`** — class_id, entry_id, position, status (waiting/promoted/withdrawn), promoted_at

### Changes to existing tables

**`entries`** — Add `promo_code_id` (nullable FK), `comped` (boolean, default false), `comped_reason` (text, nullable)

**`results`** — Add `source` column ('platform' | 'manual', default 'platform') to distinguish auto-populated from exhibitor-entered results

---

## Validation Test

After Phase 2, an exhibitor should be able to:
1. View their competition history across AKC, UKC, and ASCA trials run on the platform
2. Subscribe to premium and see title progress computed automatically
3. Enter historical results from non-platform trials and see them count toward titles
4. Add health records and training journal entries for their dogs
5. A secretary should be able to create promo codes and manage waitlists

---

*Source: Brainstorming session 2026-02-24.*
