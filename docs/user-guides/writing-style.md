# Writing Style Guide

Rules for all customer-facing documentation: user guides, KB articles, support macros, and blog posts. The goal is that a volunteer secretary or a dog exhibitor who has never read software documentation before can follow these docs confidently.

---

## Core Principle: The Software Disappears

Every guide section, KB article, and macro should feel like a calm, competent colleague explaining something — not a manual for a software product. The user's goal is running a smooth dog show or entering their dog, not learning myK9Show. Make the technology invisible.

---

## Audience

**Primary:** Retired or semi-retired volunteers and dog sport enthusiasts. Many are not "computer people." Most use a tablet or phone as their primary device. They are experts in the dog show domain and completely comfortable with AKC/UKC terminology — but not with software concepts.

**Secondary:** Club administrators and treasurers who may be slightly more tech-comfortable but are equally time-pressured and want quick answers.

**Never assume:** the user knows what a "modal", "API", "sync", "IndexedDB", "webhook", or "session" is. Never say these in customer-facing writing.

---

## Language Rules

### Use dog-show terminology, not software terminology

| Say this | Not this |
|---|---|
| Entry | Registration (in the software sense; "registration" to a dog person means the AKC/UKC number) |
| Approved / Accepted | Confirmed, processed |
| Pulled | Scratched (preferred label — "scratch" is still understood but "pulled" is the platform standard) |
| Move up | Class transfer |
| Run order | Class order, sequence |
| Armband number | Entry number, bib |
| Secretary dashboard | Mission Control, management panel |
| Check in | Self-check-in, marking present |
| Show day | Day of (avoid as a heading) |
| Send to AKC | Submit, export, transmit |

### Use task language in headings and buttons

Write headings as user actions, not feature names.

| Say this | Not this |
|---|---|
| Enter a show | Registration Wizard |
| Approve an entry | Entry Management |
| Handle a scratch | ScratchDialog |
| Print scoresheets | ReportsPage |
| Release results | Results Control |
| Connect your club's bank account | Stripe Express Onboarding |

### Keep sentences short

One idea per sentence. If a sentence needs a semicolon, split it into two.

### Use plain English for error states

Never surface technical strings in guides. If you are documenting what happens when something goes wrong, write it as: "If you see [plain description], try [plain action]. If that does not fix it, [next step]."

---

## Structure Rules

### KB articles: answer first

Structure every KB article:
1. **Answer** (1 sentence) — what they should do or know
2. **Steps** — numbered if sequential, bulleted if not
3. **Still stuck?** — one link to the next escalation (support contact or related article)

Do not start a KB article with background or context. The user is already in the situation — tell them what to do.

### Guides: task-based sections

Each guide section covers exactly one task. Section title is the task ("Approve an entry", "Print scoresheets before the show"). Steps are numbered. Notes go in a collapsible "Details" section or a one-sentence sidebar — not inline.

### Support macros: warm, brief, link-forward

Each macro is 2–4 sentences maximum plus a link. Tone: warm and specific, not corporate or generic. Every macro must end with a specific link or a clear next step the customer can take without replying.

### Blog posts: question answered in the first paragraph

The first paragraph answers the core question the post is about. Remaining paragraphs add context, steps, or related guidance. Never bury the answer.

---

## Role Tone Notes

Sourced from `docs/INTENT.md` § Role Intent Map. When writing for a specific role, the finished doc should feel like it produces this emotion.

| Role | Intent word | What this means in writing |
|---|---|---|
| Trial Secretary | "That was easy" | No jargon. Confident guidance. Every step is completable in one motion. |
| Exhibitor | "This respects my time" | Short steps. Pre-filled context. No re-explanation of what they already know. |
| Judge / Steward | "Invisible technology" | Minimal words. Action-oriented. Written for a person whose eyes are on the dog. |
| Club Admin / Treasurer | "The platform is healthy" | Factual, reassuring. Numbers and status at a glance. |

---

## Diagram Conventions

Diagrams earn their place only when they answer a question faster than prose — a branching decision, a multi-surface handoff, a role's end-to-end path. Do not add a diagram to illustrate something a numbered list already explains clearly.

**Label nodes in user language.** Use the page titles and button labels the user actually sees. Never use route paths, component names, store names, or feature-flag names in a user-facing diagram.

**Always label decision branches.** Every diamond in a flowchart must have labels on every outgoing edge.

**Apply the shared draw.io preset.** See `docs/diagrams/diagram-conventions.md` for the palette, font, and edge style. One visual language across all docs.

**Export to SVG** for the docs site. Keep the `.drawio`/JSON source in `docs/diagrams/` — never hand-edit an exported SVG.

---

## What NOT to Write

- Do not reference internal route names or component names in guides or KB articles (`ShowCreationWizardPage`, `/secretary/dashboard`). Use the page title the user sees.
- Do not write "click the three-dot menu, then Manage, then scroll to…" — if a step takes that many words, it is a UX finding. File it; simplify the doc.
- Do not say "Note that…" or "Please be aware that…" — if it is important enough to say, say it plainly. If it is not, cut it.
- Do not say "as mentioned above" or refer to other sections by number — use links.
- Do not use phrases like "simply", "just", or "easily" — they imply the user is slow if they found it hard.
- Do not write a "by the way" paragraph at the end of a guide section. If it matters, it belongs in the steps. If it does not, cut it.

---

## Sensitive Content Rules (Public Repository)

This repository is public. Every doc written here is world-readable on merge.

- Never include customer PII, real names, emails, or production account data in any example.
- Use seeded fixture accounts and seeded show names in screenshots and examples.
- Never include credentials, secrets, or internal escalation paths in customer-facing docs.
- If a support doc needs a production lookup query, it goes in `docs/support/investigation-cookbook.md` — which is also public-safe per its own rules, but clearly marked internal.
